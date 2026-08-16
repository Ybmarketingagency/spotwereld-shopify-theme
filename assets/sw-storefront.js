/*
 * sw-storefront.js — Spotwereld storefront gedrag
 *
 * Stond eerder als twee inline <script> blokken in snippets/meta-tags.liquid, midden in
 * de <head>. Daar blokkeerde het de HTML-parser en werd het bij elke paginaweergave
 * opnieuw meegestuurd in de HTML, zonder ooit gecached te kunnen worden. Als los asset
 * haalt de browser het eenmalig op en hergebruikt het daarna site-breed.
 *
 * Wordt met defer geladen: uitvoering na het parsen van de HTML, maar nog voor
 * DOMContentLoaded. Alle listeners hieronder staan dus op tijd klaar.
 *
 * Inhoud:
 *   1. Checkout-knoppen omleiden naar /pages/gegevens (headless checkout)
 *   2. Scrollpositie bewaren rond Shopify's facet-submit
 *   3. Volgorde van de productkaarten (merkprioriteit + kleurvarianten bij elkaar)
 *   4. Welkom 5%-kortingpopup
 *
 * De productfilters stonden hier ook in: een tabel per producthandle plus client-side
 * verbergen van kaarten. Dat is op 2026-08-14 verwijderd. Alle filters draaien nu op
 * Shopify zelf (Search & Discovery met de metavelden custom.lichtkleur en de
 * custom.*_filter-reeks). Voeg hier dus geen filterlogica meer toe: als een filter
 * niet klopt, ligt dat aan de metaveldwaarde op het product of aan de instelling in
 * Search & Discovery.
 */

(function(){
  // ============== INTERCEPT CHECKOUT BUTTON → /pages/gegevens ==============
  // Alle "Door naar kassa" / "Checkout" knoppen omleiden naar onze custom step
  function isCheckoutTrigger(el){
    if (!el || !el.tagName) return false;
    var name = (el.getAttribute('name')||'').toLowerCase();
    var href = (el.getAttribute('href')||'').toLowerCase();
    var txt = (el.textContent||'').toLowerCase();
    if (name === 'checkout' || name === 'add') return name === 'checkout';
    if (href === '/checkout' || href.indexOf('/checkout?') === 0) return true;
    if (el.matches && el.matches('[href$="/checkout"], button[name="checkout"], button[type="submit"][form*="cart"]')) return true;
    if (txt && (txt.indexOf('door naar kassa') > -1 || txt.indexOf('checkout') > -1 || txt.indexOf('afrekenen') > -1)){
      // Alleen knoppen/links binnen cart context (vermijd false positives)
      if (el.closest('form[action*="/cart"], #cart, cart-drawer, [is*="cart"], .cart, [class*="cart"]')) return true;
    }
    return false;
  }
  document.addEventListener('click', function(e){
    if (location.pathname === '/pages/gegevens') return; // niet redirecten als al op gegevens
    var t = e.target;
    if (!t || !t.closest) return;
    var trigger = t.closest('button[name="checkout"], a[href="/checkout"], a[href^="/checkout?"]');
    if (!trigger){
      // Check submit buttons in cart forms
      var btn = t.closest('button[type="submit"], input[type="submit"]');
      if (btn && btn.closest('form[action*="/cart"]')){
        var formName = btn.getAttribute('name') || '';
        if (formName === 'checkout' || /afrekenen|kassa|checkout/i.test(btn.textContent||'')){
          trigger = btn;
        }
      }
    }
    if (!trigger) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    window.location.href = '/pages/gegevens';
  }, true);

  // Hier stond een keten van <html>-classes: checkProductPage() zette sw-product-page,
  // sw-product-quaro-html en sw-main-img-ready-html, en markTitleReady() zette
  // sw-title-ready. Alleen de CSS die de H1 verborg las die classes, en die is hierboven
  // verwijderd. sw-product-quaro-html en sw-main-img-ready-html werden nergens gelezen.
  // Weg is dus ook: twee window-listeners, een capture-phase click-listener op document
  // en een DOMContentLoaded-handler, op elke pagina van de site.
  // ============== PRODUCTVOLGORDE ==============
  // De filters draaien volledig op Shopify (Search & Discovery + metavelden in de
  // custom.*_filter-reeks). Hier staat alleen nog wat de volgorde van de kaarten regelt.
  function getHandle(card){
    var link = card.querySelector('a[href*="/products/"]');
    if (!link) return '';
    return (link.getAttribute('href').split('/products/')[1]||'').split(/[?#\/]/)[0];
  }
  // ============== SCROLL PRESERVE bij Shopify form submit (Kleur, Lichtkleur native etc) ==============
  // Save scroll voor Shopify's facet form submit; restore na page load
  document.addEventListener('submit', function(e){
    var form = e.target;
    if (form && (form.id||'').indexOf('facets') > -1 || (form.className||'').indexOf('facets') > -1){
      try { sessionStorage.setItem('sw_scroll', String(window.scrollY)); } catch(err){}
    }
  }, true);
  // Bij click op native facet checkbox, save scroll vóór Shopify auto-submit
  document.addEventListener('click', function(e){
    var t = e.target;
    if (!t || t.tagName !== 'INPUT') return;
    var name = t.getAttribute('name')||'';
    if (name.indexOf('filter.') === 0){
      try { sessionStorage.setItem('sw_scroll', String(window.scrollY)); } catch(err){}
    }
  }, true);
  // Bij page load, herstel scroll
  try {
    var savedScroll = sessionStorage.getItem('sw_scroll');
    if (savedScroll !== null){
      sessionStorage.removeItem('sw_scroll');
      var target = parseInt(savedScroll, 10);
      if (!isNaN(target)){
        // Disable browser auto-scroll restoration
        if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
        // Try multiple times tot DOM klaar is
        var tries = 0;
        var restoreFn = function(){
          window.scrollTo(0, target);
          if (++tries < 10) setTimeout(restoreFn, 100);
        };
        restoreFn();
      }
    }
  } catch(err){}
  // De volgorde van de collectie komt uit Shopify zelf.
  //
  // Hier stond een script dat de tegels na het laden herschikte: eerst Lesto, Lyvo,
  // Quaro en Ferro, en kleuren van hetzelfde model bij elkaar. Dat tweede is overbodig
  // sinds elke kleurfamilie één product is, en het eerste hoort in de collectievolgorde
  // thuis. Bovendien zag je de tegels zichtbaar verspringen: het draaide bij het laden
  // en daarna nog eens na 400 en 1200 milliseconden.
})();


/* ===== WELKOM POPUP v2 — vanaf scratch ===== */
(function(){
  var DISCOUNT_CODE = 'WELKOM5';
  var POPUP_DELAY = 30000;
  var SHOWN_KEY = 'sw_popup_shown_v2';
  var CODE_KEY  = 'sw_discount_code_v2';

  function hasShown(){ try{ return localStorage.getItem(SHOWN_KEY) === '1'; }catch(e){ return false; } }
  function markShown(){ try{ localStorage.setItem(SHOWN_KEY,'1'); }catch(e){} }
  function setCode(c){ try{ localStorage.setItem(CODE_KEY, c); }catch(e){} }
  function getCode(){ try{ return localStorage.getItem(CODE_KEY); }catch(e){ return null; } }

  function buildPopup(){
    if (document.getElementById('swp2-overlay')) return;
    var wrap = document.createElement('div');
    wrap.id = 'swp2-overlay';
    wrap.setAttribute('role','dialog');
    wrap.setAttribute('aria-modal','true');
    wrap.style.cssText = 'position:fixed;inset:0;background:rgba(6,31,64,.55);z-index:2147483646;display:none;align-items:center;justify-content:center;padding:1rem;font-family:inherit;animation:swp2Fade .25s ease';

    var card = document.createElement('div');
    card.id = 'swp2-card';
    card.style.cssText = 'background:#fff;border-radius:16px;max-width:440px;width:100%;padding:2.5rem 1.75rem 2rem;box-shadow:0 20px 60px rgba(0,0,0,.25);text-align:center;position:relative;animation:swp2Slide .35s cubic-bezier(.16,1,.3,1)';

    // CLOSE BUTTON — eigen wrapper element BUITEN het card, top-right van overlay
    var closeWrap = document.createElement('div');
    closeWrap.id = 'swp2-close';
    closeWrap.setAttribute('role','button');
    closeWrap.setAttribute('aria-label','Sluiten');
    closeWrap.setAttribute('tabindex','0');
    closeWrap.style.cssText = 'position:absolute;top:-14px;right:-14px;width:44px;height:44px;background:#fff;border:2px solid #061f40;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:24px;color:#061f40;font-family:Arial,sans-serif;font-weight:400;line-height:1;user-select:none;box-shadow:0 4px 12px rgba(0,0,0,.15);z-index:1';
    closeWrap.innerHTML = '<span style="pointer-events:none;display:block;margin-top:-2px">&times;</span>';

    var content = document.createElement('div');
    content.innerHTML = '<span style="display:inline-block;background:linear-gradient(135deg,#FF6B35,#F7931E);color:#fff;font-weight:800;font-size:.7rem;letter-spacing:.1em;text-transform:uppercase;padding:.35rem .75rem;border-radius:999px;margin-bottom:.75rem">Exclusief voor jou</span>'+
      '<div style="font-size:3.5rem;font-weight:900;margin:.25rem 0;letter-spacing:-.03em;line-height:1;background:linear-gradient(135deg,#083D7D,#0F6FE3);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent">5% korting</div>'+
      '<h2 style="font-size:1.4rem;font-weight:900;color:#061f40;margin:0 0 .5rem;letter-spacing:-.02em">Op je eerste bestelling</h2>'+
      '<p style="color:#475569;font-size:.92rem;line-height:1.5;margin:0 0 1.25rem">Meld je aan voor onze nieuwsbrief en ontvang direct 5% korting op je volgende LED-spot bestelling.</p>'+
      '<form id="swp2-form" style="display:flex;flex-direction:column;gap:.6rem">'+
        '<input type="email" id="swp2-email" required placeholder="jouw@email.nl" autocomplete="email" style="width:100%;padding:.85rem 1rem;border:1.5px solid #e2e8f0;border-radius:8px;font-size:.95rem;outline:none;box-sizing:border-box;font-family:inherit">'+
        '<button type="submit" id="swp2-submit" style="background:linear-gradient(135deg,#083D7D,#0F6FE3);color:#fff;border:0;border-radius:8px;padding:.95rem 1rem;font-weight:700;font-size:.95rem;cursor:pointer;font-family:inherit">Stuur mij de kortingscode</button>'+
        '<p style="font-size:.7rem;color:#94a3b8;margin:.5rem 0 0">Geen spam, alleen tips &amp; aanbiedingen. Afmelden kan altijd.</p>'+
      '</form>'+
      '<div id="swp2-success" style="display:none">'+
        '<span style="display:inline-block;background:#16a34a;color:#fff;font-weight:800;font-size:.7rem;letter-spacing:.1em;text-transform:uppercase;padding:.35rem .75rem;border-radius:999px;margin-bottom:.75rem">Gelukt!</span>'+
        '<h2 style="font-size:1.4rem;font-weight:900;color:#061f40;margin:.5rem 0">Hier is je code</h2>'+
        '<p style="color:#475569;font-size:.92rem;line-height:1.5;margin:0 0 1rem">Gebruik deze code bij de checkout. Een kopie staat ook in je inbox.</p>'+
        '<div style="display:inline-flex;align-items:center;gap:.6rem;background:#f1f5f9;border:2px dashed #0F6FE3;border-radius:10px;padding:.85rem 1.1rem;margin:.5rem 0 1rem;font-family:Courier New,monospace;font-size:1.4rem;font-weight:900;color:#061f40;letter-spacing:.1em"><span id="swp2-code-txt">WELKOM5</span><button type="button" id="swp2-copy" style="background:#061f40;color:#fff;border:0;padding:.4rem .75rem;border-radius:6px;font-size:.75rem;font-weight:600;cursor:pointer;letter-spacing:.05em;font-family:inherit">Kopieer</button></div>'+
        '<button type="button" id="swp2-done" style="background:linear-gradient(135deg,#083D7D,#0F6FE3);color:#fff;border:0;border-radius:8px;padding:.85rem 1rem;font-weight:700;font-size:.95rem;cursor:pointer;width:100%;font-family:inherit">Verder winkelen</button>'+
      '</div>';

    card.appendChild(closeWrap);
    card.appendChild(content);
    wrap.appendChild(card);

    // Keyframes
    if (!document.getElementById('swp2-style')){
      var st = document.createElement('style');
      st.id = 'swp2-style';
      st.textContent = '@keyframes swp2Fade{from{opacity:0}to{opacity:1}}@keyframes swp2Slide{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}#swp2-close:hover{background:#061f40;color:#fff;transform:scale(1.08)}#swp2-email:focus{border-color:#0F6FE3;box-shadow:0 0 0 3px rgba(15,111,227,.15)}';
      document.head.appendChild(st);
    }
    document.body.appendChild(wrap);

    // ===== CLOSE — meerdere bindings =====
    function close(){
      wrap.style.display = 'none';
      document.body.style.overflow = '';
      markShown();
    }
    window.swClosePopupV2 = close;

    closeWrap.onclick = close;
    closeWrap.onmousedown = function(e){ e.preventDefault(); close(); };
    closeWrap.onpointerdown = function(e){ e.preventDefault(); close(); };
    closeWrap.addEventListener('click', close);
    closeWrap.addEventListener('touchend', function(e){ e.preventDefault(); close(); });
    closeWrap.addEventListener('keydown', function(e){ if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); close(); } });

    // Klik op overlay buiten card sluit ook
    wrap.addEventListener('click', function(e){ if (e.target === wrap) close(); });

    // ESC
    document.addEventListener('keydown', function(e){
      if (e.key === 'Escape' && wrap.style.display === 'flex') close();
    });

    // Form submit
    var form = card.querySelector('#swp2-form');
    var successDiv = card.querySelector('#swp2-success');
    var submitBtn = card.querySelector('#swp2-submit');
    form.addEventListener('submit', function(e){
      e.preventDefault();
      var emailEl = card.querySelector('#swp2-email');
      var email = (emailEl.value||'').trim();
      if (!email || email.indexOf('@') < 1) return;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Bezig...';
      var fd = new FormData();
      fd.append('form_type','customer');
      fd.append('utf8','✓');
      fd.append('contact[tags]','newsletter,welkom-5');
      fd.append('contact[accepts_marketing]','true');
      fd.append('contact[email]', email);
      fetch('/contact', { method:'POST', body: fd, credentials:'same-origin' })
        .catch(function(){})
        .finally(function(){
          setCode(DISCOUNT_CODE);
          markShown();
          form.style.display = 'none';
          card.querySelector('p[style*="margin:0 0 1.25rem"]').style.display = 'none';
          successDiv.style.display = 'block';
        });
    });

    // Copy
    card.querySelector('#swp2-copy').addEventListener('click', function(){
      var btn = this;
      var code = card.querySelector('#swp2-code-txt').textContent.trim();
      try {
        navigator.clipboard.writeText(code).then(function(){
          btn.textContent = 'Gekopieerd!';
          btn.style.background = '#16a34a';
          setTimeout(function(){ btn.textContent = 'Kopieer'; btn.style.background = '#061f40'; }, 2000);
        });
      } catch(e){}
    });

    // Verder winkelen
    card.querySelector('#swp2-done').addEventListener('click', close);

    return wrap;
  }

  function show(){
    var w = buildPopup();
    w.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  // Persistent korting-bar
  function buildBar(code){
    if (document.getElementById('swp2-bar')) return;
    if (!code) return;
    try { if (sessionStorage.getItem('swp2_bar_dismissed') === '1') return; } catch(e){}
    var bar = document.createElement('div');
    bar.id = 'swp2-bar';
    bar.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:linear-gradient(90deg,#083D7D,#0F6FE3);color:#fff;padding:.65rem 1rem;text-align:center;font-size:.85rem;font-weight:600;z-index:2147483645;display:flex;align-items:center;justify-content:center;gap:.75rem;flex-wrap:wrap;font-family:inherit';
    bar.innerHTML = '<span>&#127873; Je 5% korting:</span> <code style="background:rgba(255,255,255,.18);padding:.2rem .55rem;border-radius:4px;font-family:Courier New,monospace;letter-spacing:.1em;font-weight:700">'+code+'</code> <span>(automatisch toegepast bij checkout)</span>';
    var closeBar = document.createElement('button');
    closeBar.type = 'button';
    closeBar.setAttribute('aria-label','Sluiten');
    closeBar.style.cssText = 'background:none;border:0;color:#fff;cursor:pointer;font-size:1.2rem;opacity:.8;padding:0 .35rem;font-family:inherit';
    closeBar.innerHTML = '&times;';
    closeBar.onclick = function(){ bar.remove(); try{sessionStorage.setItem('swp2_bar_dismissed','1');}catch(e){} };
    bar.appendChild(closeBar);
    document.body.appendChild(bar);
  }

  function init(){
    // Bar tonen als er al een code bekend is
    var code = getCode();
    if (code) buildBar(code);
    // Popup tonen 30s na load (1x ooit)
    if (!hasShown()){
      setTimeout(function(){ if (!hasShown()) show(); }, POPUP_DELAY);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();