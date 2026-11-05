import { mediaQueryLarge, requestIdleCallback, startViewTransition } from '@theme/utilities';
import PaginatedList from '@theme/paginated-list';
import { sectionRenderer } from '@theme/section-renderer';

/**
 * A custom element that renders a pagniated results list
 */
export default class ResultsList extends PaginatedList {
  connectedCallback() {
    super.connectedCallback();

    mediaQueryLarge.addEventListener('change', this.#handleMediaQueryChange);
    this.addEventListener('pagination:render', this.#handlePageRender);
    this.setAttribute('initialized', '');
    this.#gridObserver.observe(this, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-sw-stock-handled'],
    });
    this.#sortThenReveal();
  }

  updatedCallback() {
    super.updatedCallback();
    this.#sortThenReveal();
  }

  /**
   * Na een filterwissel of een andere herrendering van de sectie roept morph.js updatedCallback
   * aan op de losse kopie uit het antwoord, niet op het raster dat in de pagina staat. Daarom
   * houden we het raster zelf in de gaten: zodra er nieuwe tegels in staan zonder onze
   * voorraadmarkering, halen we de voorraad opnieuw op.
   */
  #gridObserver = new MutationObserver(() => this.#refreshWhenGridChanged());

  #stockBusy = false;

  #stockPending = false;

  #refreshWhenGridChanged() {
    const grid = this.querySelector('[data-testid="product-grid"]');
    // Onze eigen verschuivingen laten de markering staan; een nieuw raster komt zonder.
    if (!grid || grid.hasAttribute('data-sw-stock-handled')) return;
    if (this.#stockBusy) {
      this.#stockPending = true;
      return;
    }
    // updatedCallback ververst eerst de refs, want het raster is zojuist opnieuw opgebouwd.
    this.updatedCallback();
  }

  /**
   * De tegels staan onzichtbaar tot de nalevering-tegels op hun plek staan (zie de CSS in
   * main-collection.liquid), zodat de bezoeker ze niet ziet verspringen. Lukt het ophalen
   * niet, dan worden ze toch getoond; de CSS toont ze sowieso na 1 seconde.
   */
  #sortThenReveal() {
    this.#stockBusy = true;
    this.#stockPending = false;
    this.removeAttribute('data-sw-stock-ready');
    this.querySelector('[data-testid="product-grid"]')?.setAttribute('data-sw-stock-handled', '1');
    this.#mergeSortedCollectionPages()
      .then(() => this.#updateBackorderCards())
      .catch(() => {})
      .finally(() => {
        this.#stockBusy = false;
        // Kwam er onderweg een nieuw raster binnen, dan tellen die tegels en niet deze ronde.
        if (this.#stockPending) {
          this.#stockPending = false;
          this.updatedCallback();
          return;
        }
        this.setAttribute('data-sw-stock-ready', '1');
      });
  }

  disconnectedCallback() {
    mediaQueryLarge.removeEventListener('change', this.#handleMediaQueryChange);
    this.removeEventListener('pagination:render', this.#handlePageRender);
    this.#gridObserver.disconnect();
  }

  #handlePageRender = () => this.#updateBackorderCards();

  async #updateBackorderCards() {
    const label = this.dataset.swBackorderLabel;
    const { grid } = this.refs;
    if (!label || !grid) return;

    const cards = [...grid.querySelectorAll(':scope > li')];
    const candidates = cards.flatMap((card) => {
      const badge = card.querySelector('.sw-card-stock');
      const ids = card.dataset.swStockIds?.split(',').filter(Boolean);
      return badge && ids?.length ? [{ card, badge, ids }] : [];
    });
    const ids = [...new Set(candidates.flatMap((candidate) => candidate.ids))];
    if (!ids.length) return;

    const requests = [];
    for (let offset = 0; offset < ids.length; offset += 100) {
      const batch = ids.slice(offset, offset + 100).join(',');
      requests.push(fetch(`https://spotwereld-formulieren.vercel.app/api/voorraad?ids=${batch}`)
        .then((response) => response.ok ? response.json() : null)
        .catch(() => null));
    }
    const replies = await Promise.all(requests);
    const currentCards = grid.querySelectorAll(':scope > li');
    if (!this.isConnected || this.refs.grid !== grid ||
        cards.some((card, index) => currentCards[index] !== card) ||
        currentCards.length !== cards.length) return;

    const quantities = Object.assign({}, ...replies.map((reply) => reply?.varianten));
    const backorders = candidates.filter(({ ids }) =>
      ids.every((id) => Number.isSafeInteger(quantities[id]) && quantities[id] <= 0)
    );

    // Het aantal achter "Op voorraad". Heeft een kaart meerdere varianten, dan tonen we het
    // aantal van de eerste leverbare variant: dat is de variant die de productpagina opent.
    // Staat die op 0 terwijl een andere kleur wel voorraad heeft, dan blijft het kale label
    // staan, want een 0 naast een groen bolletje klopt niet.
    for (const { card, badge, ids } of candidates) {
      if (!ids.some((id) => Number.isSafeInteger(quantities[id]) && quantities[id] > 0)) continue;
      card.setAttribute('data-sw-stock-confirmed', '');
      const aantal = quantities[ids.find((id) => Number.isSafeInteger(quantities[id]))];
      if (!(aantal > 0)) continue;
      if (!badge.dataset.swStockLabel) badge.dataset.swStockLabel = badge.textContent.trim();
      // Het woord staat in een eigen span, want op een smal scherm botst de volledige tekst
      // met de badges linksboven; daar blijft alleen het aantal over (zie de CSS).
      const woord = document.createElement('span');
      woord.className = 'sw-card-stock-woord';
      woord.textContent = `${badge.dataset.swStockLabel}: `;
      badge.textContent = '';
      badge.append(woord, aantal.toLocaleString(document.documentElement.lang || 'nl-NL'));
    }

    // Twee teksten in het badge: op de telefoon past alleen de korte naast de badges
    // linksboven, op een breed scherm staat de volledige tekst er (zie de CSS).
    const shortLabel = this.dataset.swBackorderShort || label;
    for (const { card, badge } of backorders) {
      const lang = document.createElement('span');
      lang.className = 'sw-card-stock-lang';
      lang.textContent = label;
      const kort = document.createElement('span');
      kort.className = 'sw-card-stock-kort';
      kort.textContent = shortLabel;
      badge.textContent = '';
      badge.append(lang, kort);
      badge.classList.add('sw-card-stock--backorder');
      card.setAttribute('data-sw-stock-confirmed', '');
    }
    if (this.hasAttribute('data-sw-backorder-sort')) {
      const firstSoldOut = cards.find((card) => !card.hasAttribute('data-sw-stock-ids'));
      for (const { card } of backorders) grid.insertBefore(card, firstSoldOut ?? null);
    }
  }

  /**
   * Shopify paginates at 250 products. Merge the remaining sorted pages so
   * related models and accessories keep their order across that boundary.
   */
  async #mergeSortedCollectionPages() {
    const { grid } = this.refs;
    const modelCount = Number(this.dataset.swCollectionSize);
    const lastPage = Number(grid?.dataset.lastPage);
    const pagination = this.querySelector('#ResultsList .pagination');
    if (!modelCount || !grid || lastPage < 2 || !pagination) return;

    const currentURL = new URL(window.location.href);
    const currentPage = Number(pagination.getAttribute('data-current_page'));
    const cardSelector = ':scope > li[data-sw-sort-key]';
    const cards = [...grid.querySelectorAll(cardSelector)];

    try {
      const requests = [];
      for (let page = 1; page <= lastPage; page += 1) {
        if (page === currentPage) continue;
        const url = new URL(currentURL);
        url.searchParams.set('page', String(page));
        url.hash = '';
        requests.push(sectionRenderer.getSectionHTML(this.sectionId, true, url));
      }
      const sections = await Promise.all(requests);
      if (!this.isConnected || this.refs.grid !== grid || !pagination.isConnected ||
          window.location.href !== currentURL.href || grid.dataset.lastPage !== String(lastPage) ||
          cards[0] !== grid.querySelector(cardSelector)) return;

      for (const html of sections) {
        const page = new DOMParser().parseFromString(html, 'text/html');
        const remoteCards = page.querySelector('[data-testid="product-grid"]')?.querySelectorAll(cardSelector);
        if (!remoteCards?.length) return;
        cards.push(...remoteCards);
      }

      // Keep pagination usable if a response is incomplete or the catalog changed mid-request.
      if (new Set(cards.map((card) => card.getAttribute('data-product-id'))).size !== modelCount ||
          new Set(cards.map((card) => card.id)).size !== cards.length) return;

      const sortedCards = cards.map((card) => ({ card, key: card.getAttribute('data-sw-sort-key') ?? '' }));
      sortedCards.sort((first, second) => (first.key < second.key ? -1 : first.key > second.key ? 1 : 0));
      grid.append(...sortedCards.map(({ card }) => card));
      grid.dataset.lastPage = '1';
      pagination.remove();
    } catch {
      // The server-rendered grid and pagination are still available.
    }
  }

  /**
   * Updates the layout.
   *
   * @param {Event} event
   */
  updateLayout({ target }) {
    if (!(target instanceof HTMLInputElement)) return;

    this.#animateLayoutChange(target.value);
  }

  /**
   * Sets the layout.
   *
   * @param {string} value
   */
  #animateLayoutChange = async (value) => {
    const { grid } = this.refs;

    if (!grid) return;

    await startViewTransition(() => this.#setLayout(value), ['product-grid']);

    requestIdleCallback(() => {
      const viewport = mediaQueryLarge.matches ? 'desktop' : 'mobile';
      sessionStorage.setItem(`product-grid-view-${viewport}`, value);
    });
  };

  /**
   * Animates the layout change.
   *
   * @param {string} value
   */
  #setLayout(value) {
    const { grid } = this.refs;
    if (!grid) return;
    grid.setAttribute('product-grid-view', value);
  }

  /**
   * Handles the media query change event.
   *
   * @param {MediaQueryListEvent} event
   */
  #handleMediaQueryChange = (event) => {
    const targetElement = event.matches
      ? this.querySelector('[data-grid-layout="desktop-default-option"]')
      : this.querySelector('[data-grid-layout="mobile-option"]');

    if (!(targetElement instanceof HTMLInputElement)) return;

    targetElement.checked = true;
    this.#setLayout('default');
  };
}

if (!customElements.get('results-list')) {
  customElements.define('results-list', ResultsList);
}
