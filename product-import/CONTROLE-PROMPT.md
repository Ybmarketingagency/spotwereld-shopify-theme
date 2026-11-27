# Controle-prompt: Spotwereld GU10 set-producten

Kopieer onderstaande prompt (alles onder de streep) naar een nieuwe chat, samen met
de twee CSV's uit deze map en het bestand `Spotwereld_eigen_voorraad.xlsx`.

---

Je controleert een Shopify-productimport voor Spotwereld.nl, een Nederlandse webshop
in LED-inbouwspots. Wees kritisch en kort; noem alleen echte fouten, geen stijlvoorkeuren.

## Wat er gebouwd is en waarom

Spotwereld verkoopt nu twee soorten inbouwspots:

1. **Geïntegreerde LED-spots** (Lesto, Ferro, Lyvo, Marlo, Quaro, Warmo, Vigo, Cielo, Cavo).
   Die worden geleverd **met een losse LED-driver** die de klant boven het plafond moet
   wegwerken. Veel klanten kunnen of willen dat niet. Dat is het probleem.
2. **Lege GU10-armaturen** (Feno, Luma, Plano, Privo, Brix, Vero, Tavo, Cardo, Rendo),
   geleverd **excl. lichtbron**. Die hebben nooit een driver nodig, want bij een
   230V GU10-lamp zit de driver in de voet van de lamp zelf.

De 48 nieuwe varianten bundelen groep 2 met een passende GU10-lamp, zodat de klant een
compleet werkend setje krijgt **zonder driver of trafo**. Marge is hoger dan los verkopen.

## De centrale technische claim die je moet controleren

> "Armatuur + 230V GU10-lamp = werkt zonder driver of trafo."

Controleer of dit klopt en of er uitzonderingen zijn. Let specifiek op:
- Is er een situatie waarin een GU10-armatuur tóch een trafo nodig heeft?
- MR11/GU4 en GU5.3/MR16 zijn 12V en hebben wél een trafo nodig. De armaturen in deze
  import heten bij de leverancier "GU10/MR16" — klopt het dat MR16 hier de
  reflectorvorm aanduidt en niet de 12V GU5.3-voet? Als die aanname fout is, is de
  hele import fout.
- Een dimbare GU10-lamp vereist een fase-afsnijdingsdimmer (Triac). Is de claim
  "dimbaar" verdedigbaar zonder dat er een dimmer in de set zit?

## Naamgeving en conventies die gevolgd zijn

Spotwereld geeft elk leveranciersproduct een **eigen naam** en **eigen SKU**. Voorbeelden
van de bestaande mapping (leverancier → Spotwereld): Varda → Lesto, Hugo → Ferro,
Mimi → Cielo, Pollux → Marlo/Vigo, Miran → Lyvo/Warmo, Laom → Quaro, Hydra → Cavo,
Odessa → Movo, Metis → Feno, Carme → Luma, Pasiphae → Plano, Hessle → Privo,
Pasithee → Brix, Sponde → Brivo, Tolos → Dovo.

Gevolgde conventies, afgeleid uit de bestaande catalogus:
- **Titel**: `LED Inbouwspot Set <Naam> | <vermogen/functie> | <IP> | <zaagmaat>` —
  vier segmenten met pipes, geen kleur in de titel (kleur is een variant).
- **Handle**: `led-inbouwspot-set-<naam>`, één handle per serie.
- **Varianten**: Option1 = Kleur, Option2 = Lichtkleur, Option3 = Vermogen.
  Dit volgt de live catalogus (sleutels als `led-inbouwspot-lesto#Mat Wit`) en het
  bestaande set-product `led-inbouwspots-set-dovo-10-stuks` dat ook drie opties heeft.
- **SKU**: `SW-ST-<NAAM4>-<NN>`, doorlopend genummerd 01-48. Volgt het bestaande
  patroon `SW-HL-SENT-01` / `SW-OS-LARG-15` (HL = hanglamp, OS = opbouwspot,
  ST = set).
- **Vendor** `Spotwereld`, **Type** `Inbouwspots`, Published TRUE, Status active,
  Inventory Policy `continue`, Fulfillment `manual`, Inventory Tracker leeg,
  Product Category leeg, SEO-velden leeg — allemaal zoals in de bestaande import.
- **Tags**: lowercase kebab-case, alfabetisch, komma + spatie.
- **Body (HTML)**: `<p><strong>hook</strong></p>` → `<h3>Productkenmerken</h3><ul>` →
  `<h3>Specificaties</h3><table><tbody>`, exact de structuur van het bestaande
  product `led-inbouwspot-therma-zilver`.

## Wat je moet nalopen

1. **Kolomkoppen en -volgorde** moeten exact gelijk zijn aan `assets/sw-import-temp.csv`
   (31 kolommen). Controleer dat Shopify dit accepteert.
2. **Variantstructuur**: bij meerdere rijen per handle staan Title, Body, Vendor, Type,
   Tags, Published, Gift Card en Status alleen op de eerste rij. Is dat correct
   voor een Shopify-import?
3. **Alle 48 SKU's uniek**, en geen botsing met bestaande SKU's
   (`SW-HL-*`, `SW-OS-*`, `SW-OMEGA-S`, `RONDOO-*`, `DEPT-WIT`, `CISCO-*`).
4. **Specificaties per variant** tegen de inkooplijst en het Excel-bestand:
   zaagmaat, inbouwdiepte, IP-waarde, lumen, CRI, garantie.
5. **Kleurcombinatie lamp/armatuur**: witte armaturen krijgen een witte lampbody,
   zwarte een zwarte, metallic/RVS/aluminium een witte. Is dat logisch of moet
   dat anders?
6. **Prijzen zijn plaatshouders** (€19,95 / €22,95 / €24,95 / €27,95 / €69,95 / €129,95).
   De inkoopprijzen bij Profolux staan achter een login en zijn **niet** gecontroleerd.
   Reken deze niet na — markeer alleen dat ze vervangen moeten worden.
7. **Variant Grams zijn schattingen** (200 g voor de GU10-sets, 900 g en 1600 g voor
   Brix). Niet gewogen. Controleer of dat plausibel is voor de verzendtarieven.
8. **Image Src is leeg gelaten**, want de foto's bestaan nog niet. De conventie is
   `https://cdn.shopify.com/s/files/1/0988/8720/5208/files/<handle>-<n>.jpg`.
9. **8 varianten zijn niet te bouwen**: elke combinatie met de lamp `276581`
   (Brivo Wit 7W 2700K) staat op 0 voorraad bij Profolux. Omdat voorraad niet
   getrackt wordt en het beleid `continue` is, zijn ze wel te koop. Moeten die
   varianten eruit, of op `draft`?
10. **`FS42-SILVER`** (Luma RVS) staat in het tabblad "Te controleren" van het
    Excel-bestand. Onduidelijk waarom. Vier varianten hangen eraan.
11. **Brix Wit 1× AR111** heeft maar 36 stuks armatuurvoorraad.

## Bronvermelding

Alle specs komen van de productpagina's van profolux.com, opgehaald op 2026-11-27,
uit het veld "Technische Specificaties" en in het bijzonder het veld
"Geleverd Inclusief". Voorraadcijfers komen uit het tabblad `profolux` van het
Excel-bestand. Controleer steekproefgewijs tegen de live pagina's; cijfers kunnen
inmiddels verschoven zijn.
