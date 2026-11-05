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
    this.#sortThenReveal();
  }

  updatedCallback() {
    super.updatedCallback();
    this.#sortThenReveal();
  }

  /**
   * De tegels staan onzichtbaar tot de nalevering-tegels op hun plek staan (zie de CSS in
   * main-collection.liquid), zodat de bezoeker ze niet ziet verspringen. Lukt het ophalen
   * niet, dan worden ze toch getoond; de CSS toont ze sowieso na 1 seconde. Bij een
   * filterwissel gaat de vlag er eerst weer af, zodat ook dan niets verspringt.
   */
  #sortThenReveal() {
    this.removeAttribute('data-sw-stock-ready');
    this.#mergeSortedCollectionPages()
      .then(() => this.#updateBackorderCards())
      .catch(() => {})
      .finally(() => this.setAttribute('data-sw-stock-ready', ''));
  }

  disconnectedCallback() {
    mediaQueryLarge.removeEventListener('change', this.#handleMediaQueryChange);
    this.removeEventListener('pagination:render', this.#handlePageRender);
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

    for (const { card, ids } of candidates) {
      if (ids.some((id) => Number.isSafeInteger(quantities[id]) && quantities[id] > 0)) {
        card.setAttribute('data-sw-stock-confirmed', '');
      }
    }

    for (const { card, badge } of backorders) {
      badge.textContent = label;
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
