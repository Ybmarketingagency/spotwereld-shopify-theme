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
 *   2. Eigen productfilters (vorm, IP, zaagmaat, inbouwdiepte, lichtkleur, wattage,
 *      buitenmaat, kantelbaar) incl. active-chips en Lichtkleur-sortering
 *   3. Welkom 5%-kortingpopup
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
  // ============== MULTI FILTER HIJACK + CHIPS (Vorm + IP + Zaagmaat + Lichtkleur opties) ==============
  // Product spec lookup per handle
  // CCT switch = 2700K + 3000K + 4000K + tri-color
  var CCT_LK = ['2700','3000','4000','tri'];
  var LAOM_LK = ['2700'];
  // diepte = array van mogelijke waarden; wattage = array (CCT spots zijn vaak 2 wattages)
  // buitenmaat = outer diameter/zijde in mm (Aristo 85, Miran 86, LAOM 95 vierkant)
  var SW_PRODUCT_SPECS = {
    'orvo-moderne-inbouwspot-zwart': {vorm:'rond', ip:'IP20', zaag:null, diepte:null, lk:[], watt:null, kantel:'ja'},
    'balo-moderne-inbouwspot-wit': {vorm:'rond', ip:'IP44', zaag:null, diepte:null, lk:[], watt:null, kantel:'ja'},
    'viko-moderne-inbouwspot-brons': {vorm:'rond', ip:'IP20', zaag:null, diepte:null, lk:[], watt:null, kantel:'ja'},
    'viko-moderne-inbouwspot-wit': {vorm:'rond', ip:'IP20', zaag:null, diepte:null, lk:[], watt:null, kantel:'ja'},
    'arco-inbouwspot-donkerbrons': {vorm:'rond', ip:'IP20', zaag:null, diepte:null, lk:['gu10'], watt:null, kantel:'ja'},
    'orvo-inbouwspot-staal': {vorm:'rond', ip:'IP20', zaag:null, diepte:null, lk:[], watt:null, kantel:'ja'},
    'led-inbouwspot-lesto-mat-wit': {vorm:'rond', ip:'IP65', zaag:[68,75], diepte:[29], lk:CCT_LK, watt:[4,6], kantel:'ja', buiten:85},
    'led-inbouwspot-lesto-mat-zwart': {vorm:'rond', ip:'IP65', zaag:[68,75], diepte:[29], lk:CCT_LK, watt:[4,6], kantel:'ja', buiten:85},
    'led-inbouwspot-lesto-zilver': {vorm:'rond', ip:'IP65', zaag:[68,75], diepte:[29], lk:CCT_LK, watt:[4,6], kantel:'ja', buiten:85},
    'led-inbouwspot-lesto-koper': {vorm:'rond', ip:'IP65', zaag:[68,75], diepte:[29], lk:CCT_LK, watt:[4,6], kantel:'ja', buiten:85},
    'led-inbouwspot-lesto-goud': {vorm:'rond', ip:'IP65', zaag:[68,75], diepte:[29], lk:CCT_LK, watt:[4,6], kantel:'ja', buiten:85},
    'led-inbouwspot-lesto-satin-metallic': {vorm:'rond', ip:'IP65', zaag:[68,75], diepte:[29], lk:CCT_LK, watt:[4,6], kantel:'ja', buiten:85},
    'led-inbouwspot-lyvo-mat-wit': {vorm:'rond', ip:'IP65', zaag:[68,75], diepte:[25], lk:CCT_LK, watt:[5,7], kantel:'ja', buiten:86},
    'led-inbouwspot-lyvo-mat-zwart': {vorm:'rond', ip:'IP65', zaag:[68,75], diepte:[25], lk:CCT_LK, watt:[5,7], kantel:'ja', buiten:86},
    'led-inbouwspot-lyvo-goud': {vorm:'rond', ip:'IP65', zaag:[68,75], diepte:[25], lk:CCT_LK, watt:[5,7], kantel:'ja', buiten:86},
    'led-inbouwspot-quaro-wit': {vorm:'vierkant', ip:'IP65', zaag:[75,80], diepte:[29], lk:CCT_LK, watt:[4,6], kantel:'ja', buiten:95},
    'led-inbouwspot-quaro-mat-zwart': {vorm:'vierkant', ip:'IP65', zaag:[75,80], diepte:[29], lk:CCT_LK, watt:[4,6], kantel:'ja', buiten:95},
    'led-inbouwspot-quaro-zilver': {vorm:'vierkant', ip:'IP65', zaag:[75,80], diepte:[29], lk:CCT_LK, watt:[4,6], kantel:'ja', buiten:95},
    'led-inbouwspot-privo-wit': {vorm:'rond', ip:'IP65', zaag:[68,75], diepte:[60], lk:CCT_LK, watt:[3,5], kantel:'ja'},
    'led-inbouwspot-privo-zwart': {vorm:'rond', ip:'IP65', zaag:[68,75], diepte:[60], lk:CCT_LK, watt:[5], kantel:'ja'},
    'led-inbouwspot-therma-zilver': {vorm:'rond', ip:'IP44', zaag:[70,75], diepte:[25], lk:[], watt:[5], kantel:'ja'},
    'led-inbouwspot-depro-wit': {vorm:'rond', ip:'IP20', zaag:[85,85], diepte:[60], lk:CCT_LK, watt:[5], kantel:'ja'},
    'led-inbouwspot-rendo-aluminium': {vorm:'rond', ip:'IP20', zaag:[70,70], diepte:[38], lk:['2700','4000'], watt:[3.8], kantel:'ja'},
    'led-inbouwspot-tillo-mat-wit': {vorm:'rond', ip:'IP20', zaag:[70,70], diepte:[38], lk:['2700'], watt:[3.8], kantel:'ja'},
    'led-inbouwspot-svena-aluminium': {vorm:'rond', ip:'IP20', zaag:[70,70], diepte:[38], lk:['2700','4000'], watt:[3.8], kantel:'ja'},
    'led-inbouwspot-feno-wit': {vorm:'rond', ip:'IP20', zaag:[80,85], diepte:[38], lk:['2700'], watt:[3.8], kantel:'ja'},
    'led-inbouwspot-feno-zwart': {vorm:'rond', ip:'IP20', zaag:[80,85], diepte:[38], lk:['2700','4000'], watt:[3.8], kantel:'ja'},
    'led-inbouwspot-feno-aluminium': {vorm:'rond', ip:'IP20', zaag:[80,85], diepte:[38], lk:['2700','4000'], watt:[3.8], kantel:'ja'},
    'led-inbouwspot-luma-wit': {vorm:'rond', ip:'IP20', zaag:[70,75], diepte:[38], lk:['2700','4000'], watt:[3.8], kantel:'ja'},
    'led-inbouwspot-luma-zwart': {vorm:'rond', ip:'IP20', zaag:[70,75], diepte:[38], lk:['2700','4000'], watt:[3.8], kantel:'ja'},
    'led-inbouwspot-luma-rvs': {vorm:'rond', ip:'IP20', zaag:[70,75], diepte:[38], lk:['2700','4000'], watt:[3.8], kantel:'ja'},
    'led-inbouwspot-plano-vierkant-wit': {vorm:'vierkant', ip:'IP20', zaag:[80,85], diepte:[38], lk:['2700','4000'], watt:[3.8], kantel:'ja'},
    'led-inbouwspot-plano-vierkant-zwart': {vorm:'vierkant', ip:'IP20', zaag:[80,85], diepte:[38], lk:['2700','4000'], watt:[3.8], kantel:'ja'},
    'led-inbouwspot-plano-vierkant-aluminium': {vorm:'vierkant', ip:'IP20', zaag:[80,85], diepte:[38], lk:['2700','4000'], watt:[3.8], kantel:'ja'},
    'led-inbouwspot-ferro-wit': {vorm:'rond', ip:'IP65', zaag:[50,70], diepte:[32], lk:CCT_LK, watt:[6], kantel:'ja'},
    'led-inbouwspot-ferro-zwart': {vorm:'rond', ip:'IP65', zaag:[50,70], diepte:[32], lk:CCT_LK, watt:[6], kantel:'ja'},
    'led-inbouwspot-ferro-zilver': {vorm:'rond', ip:'IP65', zaag:[50,70], diepte:[32], lk:CCT_LK, watt:[6], kantel:'ja'},
    'led-inbouwspot-ferro-goud': {vorm:'rond', ip:'IP65', zaag:[50,70], diepte:[32], lk:CCT_LK, watt:[6], kantel:'ja'},
    'led-inbouwspot-ferro-koper': {vorm:'rond', ip:'IP65', zaag:[50,70], diepte:[32], lk:CCT_LK, watt:[6], kantel:'ja'},
    'led-inbouwspot-cosmo-zwart': {vorm:'rond', ip:'IP65', zaag:[70,75], diepte:[25], lk:CCT_LK, watt:[6], kantel:'ja'}
  };
  function getHandle(card){
    var link = card.querySelector('a[href*="/products/"]');
    if (!link) return '';
    return (link.getAttribute('href').split('/products/')[1]||'').split(/[?#\/]/)[0];
  }
  function getSpecs(handle){ return SW_PRODUCT_SPECS[handle] || null; }
  function zaagInRange(zaag, rangeKey){
    if (!zaag) return false;
    var lo=zaag[0], hi=zaag[1];
    var ranges = {
      'lt49': function(){return hi < 49},
      '50-59': function(){return lo<=59 && hi>=50},
      '60-69': function(){return lo<=69 && hi>=60},
      '70-79': function(){return lo<=79 && hi>=70},
      '80-99': function(){return lo<=99 && hi>=80},
      '100-129': function(){return lo<=129 && hi>=100},
      'gt130': function(){return lo > 130}
    };
    return ranges[rangeKey] ? ranges[rangeKey]() : false;
  }
  function applyAllFilters(){
    var params = new URLSearchParams(location.search);
    var vorms = params.getAll('sw_vorm');
    var ips = params.getAll('sw_ip');
    var zaags = params.getAll('sw_zaag');
    var dieptes = params.getAll('sw_diepte');
    var lks = params.getAll('sw_lk');
    document.querySelectorAll('product-card, .product-card').forEach(function(c){
      var h = getHandle(c);
      var s = getSpecs(h);
      var grid = c.closest('li, .grid__item, .product-grid__card-wrapper') || c;
      var keep = true;
      if (vorms.length>0) keep = keep && s && vorms.indexOf(s.vorm)>-1;
      if (ips.length>0) keep = keep && s && ips.indexOf(s.ip)>-1;
      if (zaags.length>0) keep = keep && s && zaags.some(function(z){return zaagInRange(s.zaag, z)});
      if (dieptes.length>0) {
        var prodDieptes = Array.isArray(s && s.diepte) ? s.diepte : (s ? [s.diepte] : []);
        keep = keep && prodDieptes.some(function(d){ return dieptes.indexOf(String(d)) > -1; });
      }
      if (lks.length>0) keep = keep && s && s.lk && lks.some(function(l){return s.lk.indexOf(l)>-1});
      // Dimbaar Nee: all our products zijn dimbaar, dus Nee → altijd verbergen
      if (params.getAll('sw_dim').indexOf('nee') > -1) keep = false;
      // Wattage (sw_watt) — product watts is array
      var watts = params.getAll('sw_watt');
      if (watts.length>0) {
        var prodWatts = Array.isArray(s && s.watt) ? s.watt : (s ? [s.watt] : []);
        keep = keep && prodWatts.some(function(w){ return watts.indexOf(String(w)) > -1; });
      }
      // Buitenmaat (sw_buiten) — single value per product
      var buitens = params.getAll('sw_buiten');
      if (buitens.length>0) keep = keep && s && buitens.indexOf(String(s.buiten)) > -1;
      // Kantelbaar (sw_kantel) — 'ja' / 'nee'
      var kantels = params.getAll('sw_kantel');
      if (kantels.length>0) keep = keep && s && kantels.indexOf(s.kantel) > -1;
      grid.style.display = keep ? '' : 'none';
    });
  }

  // GUARD to prevent observer infinite loop
  var SW_FILTER_GUARD = false;
  function withGuard(fn){
    if (SW_FILTER_GUARD) return;
    SW_FILTER_GUARD = true;
    try { fn(); } finally {
      requestAnimationFrame(function(){ requestAnimationFrame(function(){ SW_FILTER_GUARD = false; }); });
    }
  }

  function findFacet(label){
    var details = document.querySelectorAll('.facets__item, details.facets__item');
    for (var i=0; i<details.length; i++){
      var l = details[i].querySelector('.facets__label, summary');
      if (l && l.textContent.trim().toLowerCase().indexOf(label.toLowerCase()) > -1) return details[i];
    }
    return null;
  }

  function fixVormInputs(){
    var vormFacet = document.querySelector('.sw-vorm-facet');
    if (!vormFacet) return;
    var actives = new URLSearchParams(location.search).getAll('sw_vorm');
    vormFacet.querySelectorAll('input').forEach(function(inp){
      if (inp.dataset.swFixed) return;
      inp.dataset.swFixed = '1';
      var val = inp.value.replace(/^vorm-/, '');
      inp.setAttribute('name','sw_vorm');
      inp.value = val;
      inp.checked = actives.indexOf(val) > -1;
      var li = inp.closest('li, .facets__inputs-list-item');
      if (li){ li.classList.toggle('sw-vorm-active', inp.checked); }
      inp.addEventListener('click', function(e){
        e.stopPropagation(); e.stopImmediatePropagation();
        setTimeout(function(){ toggleParamFromInputs('.sw-vorm-facet', 'sw_vorm'); }, 0);
      }, true);
      inp.addEventListener('change', function(e){ e.stopPropagation(); e.stopImmediatePropagation(); }, true);
    });
  }
  function addIPFilter(){
    if (document.querySelector('.sw-ip-facet')) { syncIPInputs(); return; }
    var anchor = document.querySelector('.sw-vorm-facet') || findFacet('Kleur');
    if (!anchor) return;
    var opts = [
      {v:'IP20', n:'IP20 (Stofbestendig)'},
      {v:'IP21', n:'IP21 (Stof- en druppelbestendig)'},
      {v:'IP44', n:'IP44 (Spatwaterdicht)'},
      {v:'IP54', n:'IP54 (Stof- en spatwaterdicht)'},
      {v:'IP65', n:'IP65 (Stof- en plenswaterdicht)'},
      {v:'IP67', n:'IP67 (Stof- en waterdicht)'}
    ];
    var html = '<details class="facets__item sw-ip-facet" open><summary class="facets__summary"><span class="facets__label">IP-waarde</span><span class="facets__icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg></span></summary><div class="facets__panel"><ul class="facets__inputs facets__inputs-list">'+
      opts.map(function(o){
        return '<li class="facets__inputs-list-item"><label class="checkbox"><input type="checkbox" class="checkbox__input" name="sw_ip" value="'+o.v+'"><span class="checkbox__label"><span class="icon-checkmark"></span><span class="checkbox__label-text">'+o.n+'</span></span></label></li>';
      }).join('')+'</ul></div></details>';
    anchor.insertAdjacentHTML('afterend', html);
    syncIPInputs();
  }
  function addDiepteFilter(){
    if (document.querySelector('.sw-diepte-facet')) { syncDiepteInputs(); return; }
    var anchor = document.querySelector('.sw-zaag-facet') || document.querySelector('.sw-ip-facet') || document.querySelector('.sw-vorm-facet') || findFacet('Kleur');
    if (!anchor) return;
    var opts = [12,15,23,25,26,27,28,30,35,36,37,38,45,47,62,68,78,80,125,133].map(function(d){return {v:String(d), n:d+' mm'};});
    var SHOW = 5;
    var itemsHtml = opts.map(function(o,i){
      var hidden = i >= SHOW ? ' style="display:none" data-sw-hidden="1"' : '';
      return '<li class="facets__inputs-list-item"'+hidden+'><label class="checkbox"><input type="checkbox" class="checkbox__input" name="sw_diepte" value="'+o.v+'"><span class="checkbox__label"><span class="icon-checkmark"></span><span class="checkbox__label-text">'+o.n+'</span></span></label></li>';
    }).join('');
    var html = '<details class="facets__item sw-diepte-facet" open><summary class="facets__summary"><span class="facets__label">Inbouwdiepte</span><span class="facets__icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg></span></summary><div class="facets__panel"><ul class="facets__inputs facets__inputs-list">'+
      itemsHtml +
      '</ul><button type="button" class="sw-show-more-diepte" style="background:none;border:0;color:#061f40;font-weight:600;font-size:.78rem;text-decoration:underline;cursor:pointer;padding:.5rem 0 0;text-align:left">Toon alle opties</button></div></details>';
    anchor.insertAdjacentHTML('afterend', html);
    var btn = document.querySelector('.sw-show-more-diepte');
    if (btn){
      btn.addEventListener('click', function(){
        var facet = document.querySelector('.sw-diepte-facet');
        var expanded = btn.dataset.swExpanded === '1';
        if (expanded){
          // Inklappen: items 5+ krijgen weer data-sw-hidden
          var lis = facet.querySelectorAll('.facets__inputs-list-item');
          for (var i=5; i<lis.length; i++){ lis[i].setAttribute('data-sw-hidden','1'); lis[i].style.display='none'; }
        } else {
          // Uitklappen: verwijder data-sw-hidden van ALLE items
          facet.querySelectorAll('[data-sw-hidden]').forEach(function(li){ li.removeAttribute('data-sw-hidden'); li.style.display=''; });
        }
        btn.textContent = expanded ? 'Toon alle opties' : 'Toon minder opties';
        btn.dataset.swExpanded = expanded ? '0' : '1';
      });
    }
    syncDiepteInputs();
  }
  function syncDiepteInputs(){
    var facet = document.querySelector('.sw-diepte-facet'); if (!facet) return;
    var actives = new URLSearchParams(location.search).getAll('sw_diepte');
    facet.querySelectorAll('input').forEach(function(inp){
      inp.checked = actives.indexOf(inp.value) > -1;
      var li = inp.closest('li'); if (li) li.classList.toggle('sw-vorm-active', inp.checked);
      if (inp.dataset.swFixed) return;
      inp.dataset.swFixed = '1';
      inp.addEventListener('click', function(e){ e.stopPropagation(); e.stopImmediatePropagation(); setTimeout(function(){ toggleParamFromInputs('.sw-diepte-facet', 'sw_diepte'); }, 0); }, true);
      inp.addEventListener('change', function(e){ e.stopPropagation(); e.stopImmediatePropagation(); }, true);
    });
  }
  function addWattFilter(){
    if (document.querySelector('.sw-watt-facet')) { syncWattInputs(); return; }
    var anchor = document.querySelector('.sw-diepte-facet') || document.querySelector('.sw-zaag-facet') || document.querySelector('.sw-ip-facet') || document.querySelector('.sw-vorm-facet') || findFacet('Kleur');
    if (!anchor) return;
    var opts = [3,4,5,6,7,8,9,10,12,15,18,20,24,30].map(function(w){return {v:String(w), n:w+' W'};});
    var html = '<details class="facets__item sw-watt-facet" open><summary class="facets__summary"><span class="facets__label">Wattage</span><span class="facets__icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg></span></summary><div class="facets__panel"><ul class="facets__inputs facets__inputs-list">'+
      opts.map(function(o,i){
        var hidden = i >= 6 ? ' style="display:none" data-sw-hidden="1"' : '';
        return '<li class="facets__inputs-list-item"'+hidden+'><label class="checkbox"><input type="checkbox" class="checkbox__input" name="sw_watt" value="'+o.v+'"><span class="checkbox__label"><span class="icon-checkmark"></span><span class="checkbox__label-text">'+o.n+'</span></span></label></li>';
      }).join('')+
      '</ul><button type="button" class="sw-show-more-watt sw-show-more-diepte" style="background:none;border:0;color:#061f40;font-weight:600;font-size:.78rem;text-decoration:underline;cursor:pointer;padding:.5rem 0 0;text-align:left">Toon alle opties</button></div></details>';
    anchor.insertAdjacentHTML('afterend', html);
    var btn = document.querySelector('.sw-show-more-watt');
    if (btn){
      btn.addEventListener('click', function(){
        var facet = document.querySelector('.sw-watt-facet');
        var expanded = btn.dataset.swExpanded === '1';
        if (expanded){
          var lis = facet.querySelectorAll('.facets__inputs-list-item');
          for (var i=6; i<lis.length; i++){ lis[i].setAttribute('data-sw-hidden','1'); lis[i].style.display='none'; }
        } else {
          facet.querySelectorAll('[data-sw-hidden]').forEach(function(li){ li.removeAttribute('data-sw-hidden'); li.style.display=''; });
        }
        btn.textContent = expanded ? 'Toon alle opties' : 'Toon minder opties';
        btn.dataset.swExpanded = expanded ? '0' : '1';
      });
    }
    syncWattInputs();
  }
  function syncWattInputs(){
    var facet = document.querySelector('.sw-watt-facet'); if (!facet) return;
    var actives = new URLSearchParams(location.search).getAll('sw_watt');
    facet.querySelectorAll('input').forEach(function(inp){
      inp.checked = actives.indexOf(inp.value) > -1;
      var li = inp.closest('li'); if (li) li.classList.toggle('sw-vorm-active', inp.checked);
      if (inp.dataset.swFixed) return;
      inp.dataset.swFixed = '1';
      inp.addEventListener('click', function(e){ e.stopPropagation(); e.stopImmediatePropagation(); setTimeout(function(){ toggleParamFromInputs('.sw-watt-facet', 'sw_watt'); }, 0); }, true);
      inp.addEventListener('change', function(e){ e.stopPropagation(); e.stopImmediatePropagation(); }, true);
    });
  }
  function addBuitenFilter(){
    if (document.querySelector('.sw-buiten-facet')) { syncBuitenInputs(); return; }
    var anchor = document.querySelector('.sw-watt-facet') || document.querySelector('.sw-diepte-facet') || findFacet('Kleur');
    if (!anchor) return;
    var opts = [80,85,86,90,95,100,110,120,150].map(function(b){return {v:String(b), n:b+' mm'};});
    var html = '<details class="facets__item sw-buiten-facet" open><summary class="facets__summary"><span class="facets__label">Buitenmaat</span><span class="facets__icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg></span></summary><div class="facets__panel"><ul class="facets__inputs facets__inputs-list">'+
      opts.map(function(o,i){
        var hidden = i >= 5 ? ' style="display:none" data-sw-hidden="1"' : '';
        return '<li class="facets__inputs-list-item"'+hidden+'><label class="checkbox"><input type="checkbox" class="checkbox__input" name="sw_buiten" value="'+o.v+'"><span class="checkbox__label"><span class="icon-checkmark"></span><span class="checkbox__label-text">'+o.n+'</span></span></label></li>';
      }).join('')+
      '</ul><button type="button" class="sw-show-more-buiten sw-show-more-diepte" style="background:none;border:0;color:#061f40;font-weight:600;font-size:.78rem;text-decoration:underline;cursor:pointer;padding:.5rem 0 0;text-align:left">Toon alle opties</button></div></details>';
    anchor.insertAdjacentHTML('afterend', html);
    var btn = document.querySelector('.sw-show-more-buiten');
    if (btn){
      btn.addEventListener('click', function(){
        var facet = document.querySelector('.sw-buiten-facet');
        var expanded = btn.dataset.swExpanded === '1';
        if (expanded){
          var lis = facet.querySelectorAll('.facets__inputs-list-item');
          for (var i=5; i<lis.length; i++){ lis[i].setAttribute('data-sw-hidden','1'); lis[i].style.display='none'; }
        } else {
          facet.querySelectorAll('[data-sw-hidden]').forEach(function(li){ li.removeAttribute('data-sw-hidden'); li.style.display=''; });
        }
        btn.textContent = expanded ? 'Toon alle opties' : 'Toon minder opties';
        btn.dataset.swExpanded = expanded ? '0' : '1';
      });
    }
    syncBuitenInputs();
  }
  function syncBuitenInputs(){
    var facet = document.querySelector('.sw-buiten-facet'); if (!facet) return;
    var actives = new URLSearchParams(location.search).getAll('sw_buiten');
    facet.querySelectorAll('input').forEach(function(inp){
      inp.checked = actives.indexOf(inp.value) > -1;
      var li = inp.closest('li'); if (li) li.classList.toggle('sw-vorm-active', inp.checked);
      if (inp.dataset.swFixed) return;
      inp.dataset.swFixed = '1';
      inp.addEventListener('click', function(e){ e.stopPropagation(); e.stopImmediatePropagation(); setTimeout(function(){ toggleParamFromInputs('.sw-buiten-facet', 'sw_buiten'); }, 0); }, true);
      inp.addEventListener('change', function(e){ e.stopPropagation(); e.stopImmediatePropagation(); }, true);
    });
  }
  function addKantelFilter(){
    if (document.querySelector('.sw-kantel-facet')) { syncKantelInputs(); return; }
    var anchor = document.querySelector('.sw-buiten-facet') || document.querySelector('.sw-watt-facet') || findFacet('Kleur');
    if (!anchor) return;
    var opts = [{v:'ja',n:'Ja'},{v:'nee',n:'Nee'}];
    var html = '<details class="facets__item sw-kantel-facet" open><summary class="facets__summary"><span class="facets__label">Kantelbaar</span><span class="facets__icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg></span></summary><div class="facets__panel"><ul class="facets__inputs facets__inputs-list">'+
      opts.map(function(o){
        return '<li class="facets__inputs-list-item"><label class="checkbox"><input type="checkbox" class="checkbox__input" name="sw_kantel" value="'+o.v+'"><span class="checkbox__label"><span class="icon-checkmark"></span><span class="checkbox__label-text">'+o.n+'</span></span></label></li>';
      }).join('')+'</ul></div></details>';
    anchor.insertAdjacentHTML('afterend', html);
    syncKantelInputs();
  }
  function syncKantelInputs(){
    var facet = document.querySelector('.sw-kantel-facet'); if (!facet) return;
    var actives = new URLSearchParams(location.search).getAll('sw_kantel');
    facet.querySelectorAll('input').forEach(function(inp){
      inp.checked = actives.indexOf(inp.value) > -1;
      var li = inp.closest('li'); if (li) li.classList.toggle('sw-vorm-active', inp.checked);
      if (inp.dataset.swFixed) return;
      inp.dataset.swFixed = '1';
      inp.addEventListener('click', function(e){ e.stopPropagation(); e.stopImmediatePropagation(); setTimeout(function(){ toggleParamFromInputs('.sw-kantel-facet', 'sw_kantel'); }, 0); }, true);
      inp.addEventListener('change', function(e){ e.stopPropagation(); e.stopImmediatePropagation(); }, true);
    });
  }
  function fixDimbaarNee(){
    var dimFacet = findFacet('Dimbaar');
    if (!dimFacet) return;
    var nee = dimFacet.querySelector('.sw-fake-nee');
    if (!nee){
      var lis = dimFacet.querySelectorAll('li, .facets__inputs-list-item');
      for (var i=0;i<lis.length;i++){
        var t = (lis[i].textContent||'').trim();
        if (t === 'Nee' || t.indexOf('Nee') === 0) { nee = lis[i]; break; }
      }
    }
    if (!nee) return;
    nee.classList.add('sw-fake-nee');
    nee.style.opacity = '1';
    nee.style.pointerEvents = 'auto';
    var inp = nee.querySelector('input');
    if (!inp) return;
    // Geef Nee unieke id + zorg dat label NIET naar Ja wijst (gekloond met dezelfde for=)
    var uniqueId = 'sw-dim-nee-input';
    inp.id = uniqueId;
    inp.disabled = false;
    inp.removeAttribute('disabled');
    inp.setAttribute('name','sw_dim');
    inp.setAttribute('value','nee');
    // Fix alle labels in deze li om naar onze input te wijzen
    nee.querySelectorAll('label').forEach(function(lbl){
      if (lbl.hasAttribute('for')) lbl.setAttribute('for', uniqueId);
    });
    var actives = new URLSearchParams(location.search).getAll('sw_dim');
    inp.checked = actives.indexOf('nee') > -1;
    nee.classList.toggle('sw-vorm-active', inp.checked);
  }
  // Delegated handlers voor Dimbaar Nee — block BOTH click+change in capture (Shopify luistert op change voor form submit)
  ['click','change','input'].forEach(function(evtName){
    document.addEventListener(evtName, function(e){
      var t = e.target;
      if (!t) return;
      var nee = t.closest && t.closest('.sw-fake-nee');
      if (!nee) return;
      var inp = nee.querySelector('input');
      if (!inp || t !== inp) return;
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (evtName === 'click'){
        setTimeout(function(){
          var p = new URLSearchParams(location.search);
          p.delete('sw_dim');
          if (inp.checked) p.append('sw_dim','nee');
          var s = p.toString();
          history.replaceState({}, '', location.pathname + (s?'?'+s:''));
          nee.classList.toggle('sw-vorm-active', inp.checked);
          applyAllFilters();
          renderActiveChips();
        }, 0);
      }
    }, true);
  });

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
  function renameKleurLabels(){ /* uitgeschakeld: toont echte optiewaarden (Wit vs Mat Wit) zodat filter 1:1 met data matcht */ }
  function dedupeAndOrderFacets(){
    // Dedup custom facets
    ['.sw-vorm-facet','.sw-ip-facet','.sw-zaag-facet','.sw-diepte-facet','.sw-watt-facet','.sw-buiten-facet','.sw-kantel-facet'].forEach(function(sel){
      var els = document.querySelectorAll(sel);
      for (var i=1; i<els.length; i++){ els[i].remove(); }
    });
    var kleurFacet = findFacet('Kleur');
    var lkFacet = findFacet('Lichtkleur');
    var parent = (kleurFacet || lkFacet) && (kleurFacet || lkFacet).parentElement;
    if (!parent) return;
    var firstFacet = parent.querySelector('.facets__item');
    if (!firstFacet) return;
    // Gewenste volgorde: Vorm, Kleur, Lichtkleur, IP, Zaagmaat, Inbouwdiepte, Wattage, Buitenmaat, Kantelbaar, [rest...]
    // We zetten ze in reverse + insertBefore firstFacet zodat ze opstapelen in correcte volgorde
    var order = [
      function(){return parent.querySelector('.sw-kantel-facet');},
      function(){return parent.querySelector('.sw-buiten-facet');},
      function(){return parent.querySelector('.sw-watt-facet');},
      function(){return parent.querySelector('.sw-diepte-facet');},
      function(){return parent.querySelector('.sw-zaag-facet');},
      function(){return parent.querySelector('.sw-ip-facet');},
      function(){return lkFacet;},
      function(){return kleurFacet;},
      function(){return parent.querySelector('.sw-vorm-facet');}
    ];
    order.forEach(function(getter){
      var el = getter();
      if (!el) return;
      if (el !== firstFacet){
        parent.insertBefore(el, firstFacet);
        firstFacet = el;
      }
    });
  }
  function syncIPInputs(){
    var facet = document.querySelector('.sw-ip-facet'); if (!facet) return;
    var actives = new URLSearchParams(location.search).getAll('sw_ip');
    facet.querySelectorAll('input').forEach(function(inp){
      inp.checked = actives.indexOf(inp.value) > -1;
      var li = inp.closest('li'); if (li) li.classList.toggle('sw-vorm-active', inp.checked);
      if (inp.dataset.swFixed) return;
      inp.dataset.swFixed = '1';
      inp.addEventListener('click', function(e){ e.stopPropagation(); e.stopImmediatePropagation(); setTimeout(function(){ toggleParamFromInputs('.sw-ip-facet', 'sw_ip'); }, 0); }, true);
      inp.addEventListener('change', function(e){ e.stopPropagation(); e.stopImmediatePropagation(); }, true);
    });
  }
  function addZaagFilter(){
    if (document.querySelector('.sw-zaag-facet')) { syncZaagInputs(); return; }
    var anchor = document.querySelector('.sw-ip-facet') || document.querySelector('.sw-vorm-facet') || findFacet('Kleur');
    if (!anchor) return;
    var opts = [
      {v:'lt49', n:'< 49 mm'},
      {v:'50-59', n:'50-59 mm'},
      {v:'60-69', n:'60-69 mm'},
      {v:'70-79', n:'70-79 mm'},
      {v:'80-99', n:'80-99 mm'},
      {v:'100-129', n:'100-129 mm'},
      {v:'gt130', n:'> 130 mm'}
    ];
    var html = '<details class="facets__item sw-zaag-facet" open><summary class="facets__summary"><span class="facets__label">Zaagmaat</span><span class="facets__icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg></span></summary><div class="facets__panel"><ul class="facets__inputs facets__inputs-list">'+
      opts.map(function(o){
        return '<li class="facets__inputs-list-item"><label class="checkbox"><input type="checkbox" class="checkbox__input" name="sw_zaag" value="'+o.v+'"><span class="checkbox__label"><span class="icon-checkmark"></span><span class="checkbox__label-text">'+o.n+'</span></span></label></li>';
      }).join('')+'</ul></div></details>';
    anchor.insertAdjacentHTML('afterend', html);
    syncZaagInputs();
  }
  function syncZaagInputs(){
    var facet = document.querySelector('.sw-zaag-facet'); if (!facet) return;
    var actives = new URLSearchParams(location.search).getAll('sw_zaag');
    facet.querySelectorAll('input').forEach(function(inp){
      inp.checked = actives.indexOf(inp.value) > -1;
      var li = inp.closest('li'); if (li) li.classList.toggle('sw-vorm-active', inp.checked);
      if (inp.dataset.swFixed) return;
      inp.dataset.swFixed = '1';
      inp.addEventListener('click', function(e){ e.stopPropagation(); e.stopImmediatePropagation(); setTimeout(function(){ toggleParamFromInputs('.sw-zaag-facet', 'sw_zaag'); }, 0); }, true);
      inp.addEventListener('change', function(e){ e.stopPropagation(); e.stopImmediatePropagation(); }, true);
    });
  }
  /* Lichtkleur-filter: native Shopify facet (datagedreven) */
  function toggleParamFromInputs(scopeSel, paramName, optionalScope){
    var scope = optionalScope || document;
    var p = new URLSearchParams(location.search);
    p.delete(paramName);
    (typeof scopeSel === 'string' ? scope.querySelectorAll(scopeSel + ' input:checked, ') : scope.querySelectorAll('input:checked')).forEach(function(i){
      if (i.name === paramName) p.append(paramName, i.value);
    });
    var s = p.toString();
    history.replaceState({}, '', location.pathname + (s ? '?' + s : ''));
    applyAllFilters();
    renderActiveChips();
    // Update visual active classes
    document.querySelectorAll('.sw-vorm-facet input, .sw-ip-facet input, .sw-zaag-facet input').forEach(function(i){
      var li = i.closest('li'); if (li) li.classList.toggle('sw-vorm-active', i.checked);
    });
  }
  function renderActiveChips(){
    var holder = document.querySelector('.facets-block-wrapper--vertical, .facets__form-wrapper');
    if (!holder) return;
    holder.querySelectorAll('.sw-active-chip[data-sw-chip]').forEach(function(c){ c.remove(); });
    var p = new URLSearchParams(location.search);
    var defs = [
        {param:'sw_vorm', label:'Vorm', facetSel:'.sw-vorm-facet', map:{rond:'Rond',vierkant:'Vierkant',rechthoek:'Rechthoek'}},
        {param:'sw_ip', label:'IP', facetSel:'.sw-ip-facet', map:{IP20:'IP20',IP21:'IP21',IP44:'IP44',IP54:'IP54',IP65:'IP65',IP67:'IP67'}},
        {param:'sw_zaag', label:'Zaagmaat', facetSel:'.sw-zaag-facet', map:{'lt49':'< 49 mm','50-59':'50-59 mm','60-69':'60-69 mm','70-79':'70-79 mm','80-99':'80-99 mm','100-129':'100-129 mm','gt130':'> 130 mm'}},
        {param:'sw_diepte', label:'Inbouwdiepte', facetSel:'.sw-diepte-facet', map:{}},
        {param:'sw_watt', label:'Wattage', facetSel:'.sw-watt-facet', map:{}},
        {param:'sw_buiten', label:'Buitenmaat', facetSel:'.sw-buiten-facet', map:{}},
        {param:'sw_kantel', label:'Kantelbaar', facetSel:'.sw-kantel-facet', map:{ja:'Ja',nee:'Nee'}},
        {param:'sw_dim', label:'Dimbaar', facetSel:'.sw-fake-nee', map:{nee:'Nee'}}
      ];
      defs.forEach(function(def){
        p.getAll(def.param).forEach(function(v){
          var chip = document.createElement('span');
          chip.className = 'sw-active-chip';
          chip.setAttribute('data-sw-chip', def.param+'-'+v);
          var lbl = def.map[v] || (def.param==='sw_diepte' || def.param==='sw_buiten' ? (v + ' mm') : (def.param==='sw_watt' ? (v + ' W') : v));
          chip.innerHTML = def.label + ': ' + lbl + ' <button aria-label="Verwijder">✕</button>';
          chip.querySelector('button').addEventListener('click', function(){
            var p2 = new URLSearchParams(location.search);
            var keep = p2.getAll(def.param).filter(function(x){ return x !== v; });
            p2.delete(def.param);
            keep.forEach(function(k){ p2.append(def.param, k); });
            var s = p2.toString();
            history.replaceState({}, '', location.pathname + (s?'?'+s:''));
            var sel = def.facetSel + ' input[value="'+v+'"]';
            var inp = document.querySelector(sel);
            if (inp){ inp.checked = false; var li = inp.closest('li'); if (li) li.classList.remove('sw-vorm-active','sw-lk-active'); }
            applyAllFilters();
            renderActiveChips();
          });
          holder.insertBefore(chip, holder.firstChild);
        });
      });
  }
  // Lichtkleur-facet opschonen. LET OP: Shopify morpht de native facet-lijst (items hebben
  // data-skip-node-update), waardoor inline style/extra nodes weer verdwijnen. Daarom:
  // (1) "Instelbaar (GU10)" verbergen via CSS in <head> (morph-proof).
  // (2) RGBWW-optie via JS toevoegen + via een interval terugzetten als de morph 'm weghaalt.
  function injectLkStyle(){
    if (document.getElementById('sw-lk-style')) return;
    var s = document.createElement('style');
    s.id = 'sw-lk-style';
    // verberg "Instelbaar (GU10)" overal (lichtkleur hangt af van de gekozen GU10-lamp)
    s.textContent = '.facets__item li.facets__inputs-list-item:has(input[value="Instelbaar (GU10)"]){display:none!important;}';
    (document.head || document.documentElement).appendChild(s);
  }
  // Extra lichtkleur-opties die we ALTIJD willen tonen, ook als (nog) geen product die heeft.
  // value = de native filterwaarde; bestaat het product met die waarde, dan filtert het echt,
  // anders een bewust leeg filter (0 producten) voor toekomstige producten.
  var SW_LK_EXTRAS = [
    { label: '2200K (flame-wit)',     value: '2200K (flame-wit)',     cls: 'sw-lk-2200k' },
    { label: '3000K (warm-wit)',      value: '3000K (warm-wit)',      cls: 'sw-lk-3000k' },
    { label: 'RGBWW',                 value: 'RGBWW',                 cls: 'sw-lk-rgbww' }
  ];
  function ensureLichtkleurExtras(){
    document.querySelectorAll('.facets__item, details.facets__item').forEach(function(f){
      var lbl = f.querySelector('.facets__label');
      if (!lbl || lbl.textContent.trim() !== 'Lichtkleur') return;
      var list = f.querySelector('.facets__inputs, ul, .facets__inputs-list');
      if (!list) return;
      var items = Array.from(list.querySelectorAll('.facets__inputs-list-item, li'));
      // labels die al aanwezig zijn (native of eerder geïnjecteerd)
      var existing = {};
      items.forEach(function(it){ existing[(it.textContent||'').trim().toLowerCase().replace(/\s+/g,' ')] = true; });
      // template = eerste echte item met checkbox/radio
      var template = null;
      items.forEach(function(it){ if (!template && it.querySelector('input[type="checkbox"], input[type="radio"]')) template = it; });
      if (!template) return;
      SW_LK_EXTRAS.forEach(function(opt){
        if (existing[opt.label.toLowerCase()]) return;     // al aanwezig als echte optie
        if (list.querySelector('.' + opt.cls)) return;     // al geïnjecteerd
        var clone = template.cloneNode(true);
        clone.classList.add('sw-lk-extra', opt.cls);
        clone.style.display = '';
        var span = clone.querySelector('.checkbox__label-text, label span');
        if (span) span.textContent = opt.label;
        var nm = 'filter.v.option.lichtkleur';
        var inp = clone.querySelector('input');
        if (inp) {
          nm = inp.name || nm;
          inp.value = opt.value;
          inp.id = 'sw-lk-input-' + opt.cls;
          inp.checked = new URLSearchParams(location.search).getAll(nm).indexOf(opt.value) > -1;
          clone.querySelectorAll('label[for]').forEach(function(l){ l.setAttribute('for', inp.id); });
        }
        var cnt = clone.querySelector('.facets__count, .facets__item-count');
        if (cnt) cnt.textContent = '';
        // Shopify's facet-component kent onze dynamische input niet → eigen navigatie naar de
        // native filter-URL (matcht 0 producten = bewust leeg filter zolang er geen product is).
        var val = opt.value;
        clone.addEventListener('click', function(e){
          e.preventDefault();
          e.stopPropagation();
          var p = new URLSearchParams(location.search);
          var has = p.getAll(nm).indexOf(val) > -1;
          var keep = p.getAll(nm).filter(function(v){ return v !== val; });
          p.delete(nm);
          keep.forEach(function(v){ p.append(nm, v); });
          if (!has) p.append(nm, val);
          location.search = p.toString();
        }, true);
        // in DEZELFDE container als de native opties plaatsen (anders kan sortLichtkleur ze niet ordenen)
        (template.parentNode || list).appendChild(clone);
      });
    });
  }
  // Sorteer de Lichtkleur-opties op kleurtemperatuur (laag → hoog), specials onderaan.
  function lkRank(label){
    var t = (label || '').toLowerCase();
    if (t.indexOf('rgbww') > -1) return 9990;
    if (t.indexOf('instelbaar') > -1) return 9980;
    if (t.indexOf('dim-to-warm') > -1 || t.indexOf('dim to warm') > -1) return 9970;
    var m = t.match(/(\d{3,4})\s*k/);
    return m ? parseInt(m[1], 10) : 9999;
  }
  function sortLichtkleur(){
    document.querySelectorAll('.facets__item, details.facets__item').forEach(function(f){
      var lbl = f.querySelector('.facets__label');
      if (!lbl || lbl.textContent.trim() !== 'Lichtkleur') return;
      var items = Array.from(f.querySelectorAll('.facets__inputs-list-item, li')).filter(function(it){ return it.querySelector('input'); });
      if (items.length < 2) return;
      var parent = items[0].parentNode;
      items = items.filter(function(it){ return it.parentNode === parent; });
      var sorted = items.slice().sort(function(a, b){ return lkRank(a.textContent.trim()) - lkRank(b.textContent.trim()); });
      // alleen herordenen als de volgorde echt afwijkt (voorkomt DOM-thrash elke tick)
      if (sorted.some(function(el, i){ return el !== items[i]; })) {
        sorted.forEach(function(el){ parent.appendChild(el); });
      }
    });
  }
  function fixLichtkleurOptions(){ injectLkStyle(); ensureLichtkleurExtras(); sortLichtkleur(); }
  // Morph zet de extra opties + volgorde telkens terug — blijf ze herstellen.
  // Deze tick is nodig op collectie- en zoekpagina's, maar draaide voorheen ook eeuwig
  // door op de homepage, productpagina's en de cart, waar geen enkel facet bestaat.
  // Nu: overslaan als het tabblad onzichtbaar is, en helemaal stoppen op pagina's die
  // na 5s nog steeds geen facetten hebben (de check pas na 5s zodat lazy section
  // rendering de kans krijgt ze alsnog te plaatsen).
  var lkTimer = setInterval(function(){
    if (document.hidden) return;
    if (!document.querySelector('.facets__item, details.facets__item')) return;
    ensureLichtkleurExtras();
    sortLichtkleur();
  }, 500);
  setTimeout(function(){
    if (!document.querySelector('.facets__item, details.facets__item')) clearInterval(lkTimer);
  }, 5000);
  // Merkvolgorde bij standaard sortering (best verkocht): Lesto, Lyvo, Quaro, Ferro eerst
  var SW_BRAND_ORDER = ['lesto', 'lyvo', 'quaro', 'ferro'];
  function swBrandRank(handle){
    for (var i = 0; i < SW_BRAND_ORDER.length; i++){ if (handle.indexOf(SW_BRAND_ORDER[i]) > -1) return i; }
    return SW_BRAND_ORDER.length;
  }
  function reorderBrandPriority(){
    if (new URLSearchParams(location.search).get('sort_by')) return;
    var cards = document.querySelectorAll('product-card, .product-card');
    if (!cards.length) return;
    var wrappers = [];
    cards.forEach(function(c){
      var h = getHandle(c);
      var w = c.closest('li, .grid__item, .product-grid__card-wrapper') || c;
      if (wrappers.some(function(x){ return x.el === w; })) return;
      wrappers.push({el: w, rank: swBrandRank(h)});
    });
    if (wrappers.length < 2) return;
    var container = wrappers[0].el.parentNode;
    if (!container || container.dataset.swBrandSorted === '1') return;
    if (wrappers.some(function(w){ return w.el.parentNode !== container; })) return;
    var alreadySorted = wrappers.every(function(w, i){ return i === 0 || wrappers[i-1].rank <= w.rank; });
    if (!alreadySorted){
      wrappers.forEach(function(w, i){ w.idx = i; });
      wrappers.sort(function(a, b){ return a.rank - b.rank || a.idx - b.idx; });
      wrappers.forEach(function(w){ container.appendChild(w.el); });
    }
    container.dataset.swBrandSorted = '1';
  }
  function runAllSwFilters(){
    fixVormInputs();
    addIPFilter();
    addZaagFilter();
    addDiepteFilter();
    addWattFilter();
    addBuitenFilter();
    addKantelFilter();
    fixDimbaarNee();
    renameKleurLabels();
    dedupeAndOrderFacets();
    fixLichtkleurOptions();
    applyAllFilters();
    renderActiveChips();
    reorderBrandPriority();
  }
  function runAllSwFiltersGuarded(){
    withGuard(runAllSwFilters);
    // Pas markeer als 'ready' wanneer custom facets DAADWERKELIJK in correcte volgorde staan
    // (Vorm moet de eerste .facets__item zijn in de wrapper)
    var wrap = document.querySelector('.facets-block-wrapper--vertical, .facets__form-wrapper');
    if (!wrap) return;
    var firstFacet = wrap.querySelector('.facets__item');
    var vorm = wrap.querySelector('.sw-vorm-facet');
    var kleur = findFacet('Kleur');
    // Alleen ready als Kleur bestaat (Shopify is klaar) EN onze Vorm er ook is EN bovenaan staat
    if (kleur && vorm && firstFacet === vorm){
      if (document.body && !document.body.classList.contains('sw-filters-ready')){
        // RAF zodat layout/paint klaar is voordat we fade-in tonen
        requestAnimationFrame(function(){
          requestAnimationFrame(function(){
            document.body.classList.add('sw-filters-ready');
          });
        });
      }
    }
  }
  runAllSwFiltersGuarded();
  document.addEventListener('DOMContentLoaded', runAllSwFiltersGuarded);
  setTimeout(runAllSwFiltersGuarded, 400);
  setTimeout(runAllSwFiltersGuarded, 1200);
  setTimeout(runAllSwFiltersGuarded, 2500);
  // Initial rename ticks
  renameKleurLabels();
  var renameTicks = 0;
  var renameInterval = setInterval(function(){
    renameKleurLabels();
    if (++renameTicks > 30) clearInterval(renameInterval);
  }, 250);
  // Hier stond killOldLkClones: een opruimer voor sw-fake-lk-* elementen die door
  // splitLichtkleur in collection.json werden geinjecteerd. Die injectie is verwijderd in
  // commit a82df4d ("Fix duplicate lichtkleur filters by removing splitLichtkleur
  // injection"), dus de producent bestaat niet meer. Wat overbleef was een setInterval van
  // 200ms plus een MutationObserver op document.body die eeuwig naar niets zochten.

  // Dedicated CharacterData observer: catch text changes in facets the moment ze gebeuren
  var renameObsRunning = false;
  var renameTextObs = new MutationObserver(function(){
    if (renameObsRunning) return;
    renameObsRunning = true;
    renameKleurLabels();
    // 2 rAFs zodat onze eigen text changes niet opnieuw triggeren
    requestAnimationFrame(function(){ requestAnimationFrame(function(){ renameObsRunning = false; }); });
  });
  document.addEventListener('DOMContentLoaded', function(){
    document.querySelectorAll('.facets-block-wrapper--vertical, .facets__form-wrapper, active-facets, [class*="active-facets"]').forEach(function(scope){
      renameTextObs.observe(scope, {childList:true, subtree:true, characterData:true});
    });
  });
  // Re-arm rAF rename voor 600ms na elke Kleur klik (vangt Shopify re-render)
  document.addEventListener('click', function(e){
    var t = e.target;
    if (!t || t.tagName !== 'INPUT') return;
    var inLi = t.closest('li, .facets__inputs-list-item');
    if (!inLi) return;
    var txt = inLi.textContent || '';
    if (txt.indexOf('Wit') > -1 || txt.indexOf('Zwart') > -1 || txt.indexOf('Goud') > -1 || txt.indexOf('Koper') > -1 || txt.indexOf('Zilver') > -1 || txt.indexOf('Metallic') > -1){
      // Tight rAF loop voor 600ms — vervangt Mat Wit/Zwart de moment het verschijnt
      var start = performance.now();
      function tick(){
        renameKleurLabels();
        if (performance.now() - start < 600) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }
  }, true);
  // Observer with guard + debounce (target facet wrapper only, NOT body)
  var swFilterDebounce = null;
  var swFilterObs = new MutationObserver(function(){
    if (SW_FILTER_GUARD) return;
    clearTimeout(swFilterDebounce);
    swFilterDebounce = setTimeout(runAllSwFiltersGuarded, 150);
  });
  document.addEventListener('DOMContentLoaded', function(){
    var f = document.querySelector('.facets-block-wrapper--vertical, .facets__form-wrapper');
    if (f) swFilterObs.observe(f, {childList:true, subtree:true});
  });
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