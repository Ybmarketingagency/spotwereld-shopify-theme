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
    this.setAttribute('initialized', '');
    this.#mergeSortedCollectionPages();
  }

  updatedCallback() {
    super.updatedCallback();
    this.#mergeSortedCollectionPages();
  }

  disconnectedCallback() {
    mediaQueryLarge.removeEventListener('change', this.#handleMediaQueryChange);
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
