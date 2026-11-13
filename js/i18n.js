// Taalwissel NL/EN. De app is in het Nederlands geschreven; in het Engels vertaalt deze laag alles wat op het scherm komt.
// Inhoud van de gebruiker (PDF-tekst, bestandsnamen, zoekresultaten, ingevulde waarden) wordt nooit vertaald.
const KEY = 'pdfstudio-lang';
let current = 'nl';
try { current = localStorage.getItem(KEY) || (window.__I18N_DEFAULT__ || 'nl'); } catch { current = window.__I18N_DEFAULT__ || 'nl'; }
if (current !== 'en') current = 'nl';
export const lang = () => current;
export const L = (nl, en) => (current === 'en' ? en : nl);

/* ---------- Woordenboek (Nederlands → Engels) ---------- */
const D = {
  // algemeen
  'PDF Studio': 'PDF Studio', 'ABN PDF Studio': 'ABN PDF Studio', 'Alle hulpmiddelen': 'All tools', 'Open PDF in editor': 'Open PDF in editor', 'Toolbox': 'Toolbox',
  'Alle PDF-hulpmiddelen op één plek': 'All PDF tools in one place', 'Zoek een hulpmiddel': 'Search for a tool',
  "Bewerk, organiseer, beveilig en converteer PDF's — gratis en intern bij ABN. Bestanden worden lokaal in uw browser verwerkt.": 'Edit, organise, protect and convert PDFs — free and internal at ABN. Files are processed locally in your browser.',
  "Bewerk, organiseer, beveilig en converteer PDF's — gratis, ook zonder internet. Bestanden worden lokaal in uw browser verwerkt.": 'Edit, organise, protect and convert PDFs — free, even without internet. Files are processed locally in your browser.',
  'ABN Cleanroom Technology · intern PDF-gereedschap': 'ABN Cleanroom Technology · internal PDF tools', 'PDF Studio · open-source PDF-gereedschap': 'PDF Studio · open-source PDF tools',
  'Verwerking gebeurt lokaal in uw browser — er worden geen bestanden verstuurd': 'Processing happens locally in your browser — no files are sent',
  'Verwerking gebeurt lokaal — er worden geen bestanden verstuurd': 'Processing happens locally — no files are sent',
  'Verwerking gebeurt lokaal. Er worden geen bestanden verstuurd.': 'Processing happens locally. No files are sent.',
  'Binnenkort': 'Coming soon', 'Opties': 'Options', 'Bezig…': 'Working…', 'Klaar': 'Done', 'Downloaden': 'Download', 'Openen': 'Open', 'Annuleren': 'Cancel', 'OK': 'OK',
  'Doorgaan': 'Continue', 'Sluiten': 'Close', 'Verwijderen': 'Delete', 'Plaatsen': 'Place', 'Wissen': 'Clear', 'Alles': 'All', 'Geen': 'None', 'Omkeren': 'Invert', "Pagina's": 'Pages', 'Pagina': 'Page',
  'Omhoog': 'Move up', 'Omlaag': 'Move down', 'Bestand verwijderen': 'Remove file', 'Bestanden kiezen': 'Choose files', 'Bestand kiezen': 'Choose file',
  "Sleep PDF's hierheen of": 'Drag PDFs here or', 'Sleep een PDF hierheen of': 'Drag a PDF here or', 'Sleep afbeeldingen hierheen of': 'Drag images here or',
  'Alles blijft op uw computer.': 'Everything stays on your computer.', 'Alles blijft op uw toestel.': 'Everything stays on your device.',
  'Het bestand blijft op uw computer.': 'The file stays on your computer.', 'Het bestand blijft op uw toestel.': 'The file stays on your device.',
  'Sleep of gebruik de pijltjes om de volgorde te wijzigen': 'Drag or use the arrows to change the order', 'Paginabereik': 'Page range', 'alle': 'all',
  'Nog geen bestand gekozen': 'No file chosen yet', 'Nog geen afbeelding gekozen': 'No image chosen yet', 'Kies twee bestanden': 'Choose two files',
  'Alles downloaden als ZIP': 'Download all as ZIP', 'Voorbeeld (eerste pagina)': 'Preview (first page)', 'Beveiligde PDF': 'Protected PDF', 'Wachtwoord': 'Password',
  'Wachtwoord onjuist, probeer opnieuw.': 'Wrong password, please try again.', 'Bestand klaar': 'File ready', 'Opslaan of delen': 'Save or share',
  'Taal': 'Language',
  'bv. samenvoegen, metadata, comprimeren': 'e.g. merge, metadata, compress', 'bv. 1-3, 5': 'e.g. 1-3, 5', 'bv. 1-3, 4-6, 7-': 'e.g. 1-3, 4-6, 7-', 'bv. ISO 7': 'e.g. ISO 7',
  'bv. https://www.voorbeeld.be': 'e.g. https://www.example.com', 'bv. https://www.abn-cleanroomtechnology.com': 'e.g. https://www.abn-cleanroomtechnology.com', 'Taal / Language': 'Taal / Language',
  // secties
  'Bewerken en annoteren': 'Edit and annotate', "Pagina's organiseren": 'Organise pages', 'Optimaliseren en beveiligen': 'Optimise and protect', 'Converteren en analyseren': 'Convert and analyse',
  // tegels
  'Tekst bewerken': 'Edit text', 'Tekst wijzigen, toevoegen en zoeken-en-vervangen in de pagina.': 'Change and add text, and find-and-replace on the page.',
  'Afbeeldingen bewerken': 'Edit images', 'Afbeeldingen toevoegen, verplaatsen en schalen.': 'Add, move and resize images.',
  'Koppelingen': 'Links', 'Hyperlinks toevoegen op een gebied van de pagina.': 'Add hyperlinks to an area of the page.',
  'Markeren en opmerken': 'Highlight and comment', 'Markeren, onderstrepen, doorhalen en notities plaatsen.': 'Highlight, underline, strike out and add notes.',
  'Tekenen en vormen': 'Draw and shapes', 'Pijlen, kaders en vrije tekening op de pagina.': 'Arrows, boxes and freehand drawing on the page.',
  'Formulier invullen': 'Fill in form', 'Bestaande formuliervelden invullen en opslaan.': 'Fill in and save existing form fields.',
  'Handtekening zetten': 'Sign', 'Handtekening of initialen tekenen, typen of uploaden.': 'Draw, type or upload a signature or initials.',
  'Permanent redigeren': 'Redact permanently', 'Gevoelige inhoud definitief zwart maken en verwijderen.': 'Black out and remove sensitive content for good.',
  "PDF's samenvoegen": 'Merge PDFs', "Meerdere PDF's of pagina's combineren tot één bestand.": 'Combine several PDFs or pages into one file.',
  'PDF splitsen': 'Split PDF', "Opdelen per pagina, per aantal pagina's of op bereik.": 'Split per page, per number of pages or by range.',
  "Pagina's extraheren": 'Extract pages', "Geselecteerde pagina's opslaan als nieuw bestand.": 'Save selected pages as a new file.',
  "Pagina's verwijderen": 'Delete pages', "Ongewenste pagina's in één keer wegnemen.": 'Remove unwanted pages in one go.',
  "Pagina's ordenen": 'Organise pages', "Miniaturen slepen, draaien, verwijderen en lege pagina's invoegen.": 'Drag, rotate and delete thumbnails, and insert blank pages.',
  "Pagina's roteren": 'Rotate pages', "Alle of enkele pagina's 90°, 180° of 270° draaien.": 'Rotate all or some pages by 90°, 180° or 270°.',
  'Bijsnijden': 'Crop', "Marges bijsnijden op alle of geselecteerde pagina's.": 'Crop margins on all or selected pages.',
  'Paginanummering': 'Page numbers', 'Paginanummers toevoegen met opmaak en positie naar keuze.': 'Add page numbers with the format and position you choose.',
  'Comprimeren': 'Compress', 'Bestandsgrootte verkleinen door afbeeldingen te optimaliseren.': 'Reduce file size by optimising images.',
  'Metadata verwijderen': 'Remove metadata', 'Auteur, titel, software en verborgen gegevens wissen.': 'Remove author, title, software and hidden data.',
  'Wachtwoord instellen': 'Set password', 'PDF versleutelen (AES-256) en rechten beperken.': 'Encrypt the PDF (AES-256) and restrict permissions.',
  'Wachtwoord verwijderen': 'Remove password', 'Beveiliging opheffen van een PDF waarvan u het wachtwoord kent.': 'Remove protection from a PDF whose password you know.',
  'Watermerk': 'Watermark', 'Tekstwatermerk plaatsen, bv. "Vertrouwelijk".': 'Add a text watermark, e.g. "Confidential".',
  'Platmaken': 'Flatten', 'Formuliervelden vastzetten in de pagina.': 'Fix form fields into the page.',
  'Kop- en voettekst': 'Header and footer', 'Vaste tekst, datum of nummer bovenaan of onderaan elke pagina.': 'Fixed text, date or number at the top or bottom of every page.',
  'PDF/A omzetten': 'Convert to PDF/A', 'Archiefversie maken voor langdurige bewaring.': 'Create an archive version for long-term storage.',
  'PDF naar Word': 'PDF to Word', 'Omzetten naar een bewerkbaar .docx-bestand.': 'Convert to an editable .docx file.',
  'Word naar PDF': 'Word to PDF', 'Documenten uit Word, Excel of PowerPoint omzetten.': 'Convert documents from Word, Excel or PowerPoint.',
  'Afbeeldingen naar PDF': 'Images to PDF', 'JPG- of PNG-bestanden bundelen in één PDF.': 'Combine JPG or PNG files into one PDF.',
  'PDF naar afbeeldingen': 'PDF to images', 'Elke pagina exporteren als PNG of JPG.': 'Export every page as PNG or JPG.',
  'Tekst herkennen (OCR)': 'Text recognition (OCR)', 'Scans doorzoekbaar en selecteerbaar maken.': 'Make scans searchable and selectable.',
  'Scan opschonen': 'Clean up scan', "Scheef gescande pagina's rechtzetten en ruis verminderen.": 'Straighten skewed scans and reduce noise.',
  "PDF's vergelijken": 'Compare PDFs', 'Twee versies naast elkaar met verschillen gemarkeerd.': 'Two versions side by side with the differences highlighted.',
  "Zoeken in meerdere PDF's": 'Search multiple PDFs', 'Tekst opzoeken in een hele reeks bestanden.': 'Find text across a whole set of files.',
  // samenvoegen
  'Voeg bestanden toe, zet ze in de juiste volgorde en voeg ze samen tot één PDF.': 'Add files, put them in the right order and merge them into one PDF.',
  'Naam van het resultaat': 'Name of the result', 'Bladwijzer per bestand toevoegen': 'Add a bookmark per file', "Alle pagina's even breed maken (schalen naar breedste)": 'Make all pages the same width (scale to the widest)',
  'Kies minstens twee bestanden.': 'Choose at least two files.',
  // splitsen
  'Splitsen': 'Split', 'Elke pagina apart': 'Every page separately', "Elke N pagina's": 'Every N pages', 'Op paginabereiken': 'By page ranges', "Aantal pagina's per bestand": 'Number of pages per file',
  'Bereiken (één bestand per komma)': 'Ranges (one file per comma)', "Elk deel tussen komma's wordt een apart bestand.": 'Each part between commas becomes a separate file.', 'Geef minstens één bereik op.': 'Enter at least one range.',
  // selectie
  "Klik op de pagina's die u wilt bewaren (Shift-klik voor een reeks) of typ een bereik.": 'Click the pages you want to keep (Shift-click for a series) or type a range.',
  "Klik op de pagina's die weg moeten (Shift-klik voor een reeks) of typ een bereik.": 'Click the pages that should go (Shift-click for a series) or type a range.',
  'Elke pagina als apart bestand': 'Every page as a separate file', 'Selecteer minstens één pagina.': 'Select at least one page.',
  "Selecteer de pagina's die u wilt verwijderen.": 'Select the pages you want to delete.', "U kunt niet alle pagina's verwijderen.": 'You cannot delete all pages.',
  // ordenen
  "Sleep miniaturen om de volgorde te wijzigen, draai of verwijder pagina's. Meerdere bestanden mogen.": 'Drag thumbnails to change the order, rotate or delete pages. Multiple files are allowed.',
  'Opslaan als nieuwe PDF': 'Save as new PDF', 'Alles roteren': 'Rotate all', 'Volgorde omkeren': 'Reverse order', 'Lege pagina': 'Blank page', "Er zijn geen pagina's over.": 'There are no pages left.',
  'Linksom draaien': 'Rotate left', 'Rechtsom draaien': 'Rotate right', 'Pagina verwijderen': 'Delete page', 'Naar voren': 'Move forward', 'Naar achteren': 'Move back',
  // roteren / bijsnijden
  "Kies de draaiing en de pagina's (standaard alle).": 'Choose the rotation and the pages (all by default).', 'Draaien': 'Rotate', '90° rechtsom': '90° clockwise', '180°': '180°', '90° linksom': '90° counter-clockwise',
  'Geef de marges op die eraf moeten. Het voorbeeld toont de eerste geselecteerde pagina.': 'Enter the margins to remove. The preview shows the first selected page.',
  'Boven (mm)': 'Top (mm)', 'Onder (mm)': 'Bottom (mm)', 'Links (mm)': 'Left (mm)', 'Rechts (mm)': 'Right (mm)',
  'Bijsnijden verbergt de rand; de inhoud buiten het kader blijft in het bestand aanwezig. Gebruik Permanent redigeren voor gevoelige inhoud.': 'Cropping hides the edge; the content outside the frame stays in the file. Use Redact permanently for sensitive content.',
  'De marges zijn groter dan de pagina.': 'The margins are larger than the page.',
  // nummering
  'Kies positie en opmaak; het voorbeeld werkt meteen mee.': 'Choose position and format; the preview updates immediately.', 'Nummers toevoegen': 'Add numbers',
  'Positie': 'Position', 'Formaat': 'Format', 'Beginnen bij': 'Start at', 'Lettertype': 'Font', 'Grootte (pt)': 'Size (pt)', 'Marge (mm)': 'Margin (mm)', 'Kleur': 'Colour',
  'Eerste pagina (voorblad) niet nummeren': "Don't number the first page (cover)", "Overgeslagen pagina's wel meetellen": 'Count skipped pages anyway',
  '1, 2, 3 …': '1, 2, 3 …', 'Pagina 1 van 12': 'Page 1 of 12', '1 / 12': '1 / 12', 'i, ii, iii …': 'i, ii, iii …', '- 1 -': '- 1 -',
  'Helvetica vet': 'Helvetica bold', 'Times vet': 'Times bold', 'Courier vet': 'Courier bold',
  'Positie linksboven': 'Position top left', 'Positie middenboven': 'Position top centre', 'Positie rechtsboven': 'Position top right', 'Positie linksmidden': 'Position middle left',
  'Positie midden': 'Position centre', 'Positie rechtsmidden': 'Position middle right', 'Positie linksonder': 'Position bottom left', 'Positie middenonder': 'Position bottom centre', 'Positie rechtsonder': 'Position bottom right',
  'Positie van het paginanummer': 'Position of the page number',
  // comprimeren
  'Verkleint afbeeldingen en optimaliseert de bestandsstructuur. Tekst blijft scherp en doorzoekbaar.': 'Shrinks images and optimises the file structure. Text stays sharp and searchable.',
  'Compressie': 'Compression', 'Licht — beste kwaliteit': 'Light — best quality', 'Gemiddeld — aanbevolen': 'Medium — recommended', 'Sterk — kleinste bestand': 'Strong — smallest file',
  'Afbeeldingen worden opnieuw opgeslagen als JPEG en zo nodig verkleind. Pagina-inhoud, tekst en formulieren blijven ongewijzigd.': 'Images are re-saved as JPEG and scaled down where needed. Page content, text and forms stay unchanged.',
  'Niet verder te verkleinen': 'Cannot be reduced further',
  // metadata
  'Bekijk wat er in de PDF verborgen zit en wis wat niet gedeeld mag worden.': 'See what is hidden in the PDF and remove what should not be shared.', 'Metadata wissen': 'Remove metadata',
  'Veld': 'Field', 'Gevonden waarde': 'Value found', 'Soort': 'Type', 'Titel': 'Title', 'Auteur': 'Author', 'Onderwerp': 'Subject', 'Trefwoorden': 'Keywords', 'Gemaakt met': 'Created with',
  'PDF-producent': 'PDF producer', 'Aanmaakdatum': 'Creation date', 'Wijzigingsdatum': 'Modification date', 'Documenteigenschap': 'Document property', 'Software': 'Software', 'Datums': 'Dates', 'Verborgen': 'Hidden',
  'XMP-metadata': 'XMP metadata', 'Uitgebreide eigenschappen en bewerkingsgeschiedenis': 'Extended properties and editing history', 'Paginametadata': 'Page metadata',
  'Ingesloten bestanden': 'Embedded files', 'Bijlagen die in de PDF verstopt zitten': 'Attachments hidden in the PDF', 'JavaScript': 'JavaScript', 'Scripts die bij openen of acties uitgevoerd worden': 'Scripts that run on opening or actions',
  'Opmerkingen en markeringen': 'Comments and markups', 'Document-ID': 'Document ID', 'Unieke code waarmee versies te herkennen zijn': 'Unique code that identifies versions',
  'Alles selecteren (aanbevolen)': 'Select all (recommended)', 'Alleen documenteigenschappen': 'Document properties only', 'Alleen verborgen inhoud': 'Hidden content only',
  'Pagina-inhoud, bladwijzers en formuliervelden blijven ongewijzigd. Het resultaat wordt als nieuw bestand opgeslagen.': 'Page content, bookmarks and form fields stay unchanged. The result is saved as a new file.',
  'Kies een PDF om te zien welke metadata erin zit.': 'Choose a PDF to see which metadata it contains.', 'Geen metadata gevonden': 'No metadata found',
  'Dit bestand bevat geen documenteigenschappen of verborgen gegevens die we kunnen wissen.': 'This file has no document properties or hidden data to remove.',
  'Er is geen metadata meer aanwezig.': 'No metadata is left.', 'Selecteer minstens één onderdeel om te wissen.': 'Select at least one item to remove.',
  // beveiligen
  'Versleutel de PDF met AES-256. Zonder het wachtwoord kan niemand het bestand openen.': 'Encrypt the PDF with AES-256. Nobody can open the file without the password.', 'Beveiligen': 'Protect',
  'Wachtwoord om te openen': 'Password to open', 'Herhaal wachtwoord': 'Repeat password', 'Eigenaarswachtwoord (optioneel)': 'Owner password (optional)',
  'Nodig om de beperkingen hieronder later op te heffen. Leeg = willekeurig, sterk wachtwoord.': 'Needed to lift the restrictions below later. Empty = random, strong password.',
  'Toestaan voor wie het bestand opent': 'Allow for whoever opens the file', 'Afdrukken': 'Print', 'Tekst en afbeeldingen kopiëren': 'Copy text and images', 'Inhoud wijzigen': 'Change content',
  'Opmerkingen en formulieren invullen': 'Add comments and fill in forms', 'Geef een wachtwoord op.': 'Enter a password.', 'Gebruik minstens 4 tekens.': 'Use at least 4 characters.',
  'De wachtwoorden komen niet overeen.': 'The passwords do not match.', 'PDF beveiligd met AES-256': 'PDF protected with AES-256',
  'Bewaar het wachtwoord goed: zonder kan het bestand niet meer geopend worden.': 'Keep the password safe: without it the file can no longer be opened.',
  'Kies een beveiligde PDF en geef het wachtwoord in. U krijgt een onbeveiligde kopie.': 'Choose a protected PDF and enter the password. You get an unprotected copy.',
  'Beveiliging verwijderen': 'Remove protection', 'Beveiligd bestand — wachtwoord ok': 'Protected file — password OK', 'Dit bestand is niet beveiligd': 'This file is not protected',
  'Dit bestand is niet beveiligd; er is niets te verwijderen.': 'This file is not protected; there is nothing to remove.', 'Beveiliging verwijderd': 'Protection removed',
  'De versleuteling kon niet verwijderd worden.': 'The encryption could not be removed.',
  // watermerk
  'Plaats tekst zoals "VERTROUWELIJK" of een logo over de pagina\'s.': 'Place text such as "CONFIDENTIAL" or a logo across the pages.', 'Watermerk toevoegen': 'Add watermark',
  'Tekst': 'Text', 'Afbeelding': 'Image', 'Afbeelding (PNG of JPG)': 'Image (PNG or JPG)', 'Breedte (% van pagina)': 'Width (% of page)', 'Dekking': 'Opacity', 'Hoek': 'Angle',
  'Diagonaal': 'Diagonal', 'Horizontaal': 'Horizontal', '45°': '45°', 'Verticaal': 'Vertical', 'Plaatsing': 'Placement', 'Midden van de pagina': 'Centre of the page',
  'Herhaald over de hele pagina': 'Repeated across the whole page', 'Bovenaan': 'Top', 'Onderaan': 'Bottom', 'Kies een afbeelding.': 'Choose an image.', 'Geef een tekst op.': 'Enter a text.',
  'Kies eerst een afbeelding voor het watermerk.': 'First choose an image for the watermark.',
  // platmaken
  'Zet ingevulde formuliervelden en opmerkingen vast in de pagina, zodat ze niet meer te wijzigen zijn.': 'Fix filled-in form fields and comments into the page so they can no longer be changed.',
  'Formuliervelden platmaken': 'Flatten form fields', 'Opmerkingen en markeringen platmaken': 'Flatten comments and markups', 'Kies minstens één optie.': 'Choose at least one option.',
  'Platgemaakt': 'Flattened', 'Niets om plat te maken': 'Nothing to flatten',
  // kop/voet
  'Gebruik {pagina}, {totaal}, {datum} en {bestand} als variabelen.': 'Use {page}, {total}, {date} and {file} as variables.', 'Kop- en voettekst toevoegen': 'Add header and footer',
  'Kop links': 'Header left', 'Kop midden': 'Header centre', 'Kop rechts': 'Header right', 'Voet links': 'Footer left', 'Voet midden': 'Footer centre', 'Voet rechts': 'Footer right',
  'Niet op de eerste pagina': 'Not on the first page', 'Vul minstens één tekstvak in.': 'Fill in at least one text box.',
  // converteren
  'Voeg afbeeldingen toe en zet ze in de juiste volgorde. Elke afbeelding wordt één pagina.': 'Add images and put them in the right order. Each image becomes one page.', 'PDF maken': 'Create PDF',
  'Paginaformaat': 'Page size', 'Zelfde als afbeelding': 'Same as image', 'Richting': 'Orientation', 'Automatisch': 'Automatic', 'Staand': 'Portrait', 'Liggend': 'Landscape', 'Marge': 'Margin',
  'Klein (10 mm)': 'Small (10 mm)', 'Groot (20 mm)': 'Large (20 mm)', 'Afbeeldingen maken': 'Create images',
  "Elke pagina wordt een afbeelding. Meerdere pagina's komen samen in één ZIP.": 'Every page becomes an image. Multiple pages are bundled in one ZIP.',
  'PNG (scherp)': 'PNG (sharp)', 'JPG (kleiner)': 'JPG (smaller)', 'Resolutie': 'Resolution', '72 dpi — scherm': '72 dpi — screen', '150 dpi — standaard': '150 dpi — standard', '300 dpi — afdrukken': '300 dpi — print',
  'Kies de oude versie (1) en de nieuwe versie (2). Verschillen in tekst worden per pagina gemarkeerd.': 'Choose the old version (1) and the new version (2). Text differences are highlighted per page.',
  'Vergelijken': 'Compare', 'Ook visueel vergelijken (pixelverschillen tonen)': 'Also compare visually (show pixel differences)', 'Hoofdletters negeren': 'Ignore case',
  'Het eerste bestand in de lijst geldt als origineel. Gebruik de pijltjes om te wisselen.': 'The first file in the list counts as the original. Use the arrows to swap.',
  'Kies precies twee bestanden om te vergelijken.': 'Choose exactly two files to compare.', 'verwijderd': 'removed', 'toegevoegd': 'added', 'De bestanden zijn gelijk': 'The files are identical',
  'Geen verschillen gevonden.': 'No differences found.', 'Geen tekstverschil; wel een visueel verschil.': 'No text difference, but there is a visual difference.',
  'Visuele verschillen (rood) op de nieuwe versie — klik om te vergroten': 'Visual differences (red) on the new version — click to enlarge', 'Klik om te vergroten': 'Click to enlarge',
  "Voeg één of meer PDF's toe en zoek naar een woord of zin.": 'Add one or more PDFs and search for a word or phrase.', 'Zoeken': 'Search', 'Zoek naar': 'Search for',
  'Hoofdlettergevoelig': 'Case sensitive', 'Alleen hele woorden': 'Whole words only', 'Geef een zoekterm op.': 'Enter a search term.', 'Geen treffers.': 'No matches.',
  'Geen tekst gevonden in dit bestand (mogelijk een scan).': 'No text found in this file (possibly a scan).',
  // editor
  'Editor': 'Editor', 'Bewerken': 'Edit', 'Annoteren': 'Annotate', 'Formulieren & handtekening': 'Forms & signature', 'Redigeren': 'Redact', 'Selecteren': 'Select',
  'Tekstvak': 'Text box', 'Koppeling': 'Link', 'Witmaken': 'White-out', 'Markeren': 'Highlight', 'Onderstrepen': 'Underline', 'Doorhalen': 'Strike out', 'Opmerking': 'Comment',
  'Tekenen': 'Draw', 'Rechthoek': 'Rectangle', 'Ellips': 'Ellipse', 'Pijl': 'Arrow', 'Handtekening': 'Signature', 'Datum': 'Date', 'Vinkje': 'Check mark',
  'Ongedaan maken': 'Undo', 'Opnieuw': 'Redo', 'Opslaan als PDF': 'Save as PDF', 'Opslaan': 'Save', 'Opslaan…': 'Saving…', 'Uitzoomen': 'Zoom out', 'Inzoomen': 'Zoom in',
  'Gereedschapsgroepen': 'Tool groups', 'Gereedschappen': 'Tools', 'Paginaminiaturen': 'Page thumbnails', 'Eigenschappen': 'Properties', 'Geen bestand geopend': 'No file open', 'Geen bestand': 'No file',
  'PDF openen': 'Open PDF', 'Kies een PDF-bestand.': 'Choose a PDF file.', 'Niet-opgeslagen wijzigingen': 'Unsaved changes', 'De huidige wijzigingen gaan verloren. Doorgaan?': 'Current changes will be lost. Continue?',
  'Open een PDF om te beginnen. Alles wordt lokaal in uw browser verwerkt.': 'Open a PDF to start. Everything is processed locally in your browser.',
  'Klik op een element om het te selecteren, te verplaatsen of aan te passen. Delete verwijdert het.': 'Click an element to select, move or adjust it. Delete removes it.',
  'Klik op bestaande tekst om ze te wijzigen. De originele tekst wordt afgedekt en vervangen.': 'Click existing text to change it. The original text is replaced.',
  'Klik op de pagina om een nieuw tekstvak te plaatsen.': 'Click on the page to place a new text box.',
  'Kies een afbeelding; ze verschijnt op de huidige pagina en is te verslepen en te schalen.': 'Choose an image; it appears on the current page and can be dragged and resized.',
  'Sleep een kader over het gebied dat klikbaar moet worden en vul het webadres in.': 'Drag a box over the area that should be clickable and enter the web address.',
  'Sleep een wit vlak over inhoud die u wilt afdekken.': 'Drag a white box over content you want to cover.', 'Sleep over tekst om ze te markeren.': 'Drag over text to highlight it.',
  'Sleep over tekst om ze te onderstrepen.': 'Drag over text to underline it.', 'Sleep over tekst om ze door te halen.': 'Drag over text to strike it out.',
  'Klik op de pagina om een notitie te plaatsen.': 'Click on the page to place a note.', 'Teken met de muis of pen op de pagina.': 'Draw on the page with the mouse or pen.',
  'Sleep om een rechthoek te tekenen.': 'Drag to draw a rectangle.', 'Sleep om een ellips te tekenen.': 'Drag to draw an ellipse.', 'Sleep van begin- naar eindpunt.': 'Drag from start point to end point.',
  'Teken of typ uw handtekening; ze verschijnt op de huidige pagina.': 'Draw or type your signature; it appears on the current page.',
  "Klik op de pagina om de datum van vandaag te plaatsen.": "Click on the page to place today's date.", 'Klik op de pagina om een vinkje te plaatsen.': 'Click on the page to place a check mark.',
  'Sleep zwarte vlakken over gevoelige inhoud. Bij opslaan wordt de inhoud eronder definitief verwijderd.': 'Drag black boxes over sensitive content. When saving, the content underneath is removed for good.',
  'Afbeelding kiezen': 'Choose image', 'Handtekening maken': 'Create signature', 'Zoeken en vervangen': 'Find and replace', 'Zoek': 'Find', 'Vervang door': 'Replace with', 'Alles vervangen': 'Replace all',
  'Niet gevonden (of al bewerkt).': 'Not found (or already edited).', 'Formuliervelden': 'Form fields',
  'Deze PDF heeft geen invulbare velden. Gebruik Tekstvak, Datum of Vinkje om tekst op de pagina te zetten.': 'This PDF has no fillable fields. Use Text box, Date or Check mark to put text on the page.',
  'Formulier platmaken bij opslaan': 'Flatten form when saving', 'Tekstkleur': 'Text colour', 'Vet': 'Bold', 'Cursief': 'Italic', 'Achtergrond (afdekking)': 'Background (cover)',
  'Origineel: ': 'Original: ', 'Origineel:': 'Original:',
  'De tekst wordt in de PDF zelf vervangen, in het originele lettertype. De rest van de regel schuift mee.': 'The text is replaced in the PDF itself, in the original font. The rest of the line moves along.',
  'Deze pagina laat geen directe vervanging toe; de oude tekst wordt afgedekt en de nieuwe tekst geplaatst in een gelijkend lettertype.': 'This page does not allow direct replacement; the old text is covered and the new text is placed in a similar font.',
  'Webadres': 'Web address', 'Notitie': 'Note', 'Wordt een echte PDF-opmerking die in Acrobat en andere lezers zichtbaar is.': 'Becomes a real PDF comment, visible in Acrobat and other readers.',
  'Lijndikte (pt)': 'Line width (pt)', 'Lijndikte': 'Line width', 'Vulling': 'Fill', 'Geen vulling': 'No fill', 'Wit': 'White', 'Lichtblauw': 'Light blue', 'Geel': 'Yellow', 'Blauw': 'Blue', 'Zwart': 'Black',
  'Sleep om te verplaatsen; sleep het hoekje rechtsonder om te schalen.': 'Drag to move; drag the bottom-right corner to resize.',
  'Bij opslaan wordt deze pagina omgezet naar een afbeelding met een zwart vlak. Zo is de onderliggende tekst echt weg en niet meer te kopiëren of te doorzoeken.': 'When saving, this page is converted to an image with a black box. That way the text underneath is really gone and can no longer be copied or searched.',
  'Dekt de inhoud visueel af. De inhoud blijft wel in het bestand; gebruik Redigeren om ze echt te verwijderen.': 'Covers the content visually. The content does stay in the file; use Redact to really remove it.',
  'Tekening': 'Drawing', 'Markering': 'Highlight', 'Onderstreping': 'Underline', 'Doorhaling': 'Strikethrough', 'Witvlak': 'White-out', 'Redactievlak': 'Redaction box', 'Element': 'Element',
  'Teken met muis, pen of vinger in het vak, of typ uw naam.': 'Draw in the box with mouse, pen or finger, or type your name.', 'Getypte handtekening': 'Typed signature', 'Of typ uw naam': 'Or type your name',
  'Tekenvlak voor handtekening': 'Signature drawing area', 'Teken of typ eerst een handtekening.': 'First draw or type a signature.', 'Opgeslagen': 'Saved',
  'Wordt bepaald na de wijziging…': 'Determined after the change…', 'Lettertypebestand toevoegen': 'Add font file', 'Zoek op deze computer': 'Search this computer',
  'Het lettertype is niet op deze computer gevonden.': 'The font was not found on this computer.',
  'Lettertypen van deze computer zijn hier niet toegankelijk. Voeg het bestand toe met de knop hierboven.': 'Fonts on this computer are not accessible here. Add the file with the button above.',
  'Geen bruikbaar lettertype gevonden (gebruik .ttf of .otf).': 'No usable font found (use .ttf or .otf).',
  'In de PDF:': 'In the PDF:', 'identiek (origineel)': 'identical (original)', 'identiek': 'identical', 'metrisch gelijk': 'metrically equal', 'gelijkend': 'similar',
  'Lokaal verwerkt — niets verlaat uw computer': 'Processed locally — nothing leaves your computer', 'Lokaal verwerkt — niets verlaat uw toestel': 'Processed locally — nothing leaves your device',
  // offline-app
  'Werkt offline': 'Works offline', 'Alle lettertypes offline bewaren (± 95 MB)': 'Save all fonts offline (± 95 MB)', 'Alle lettertypes offline': 'All fonts offline', 'Installeren als app': 'Install as app',
  'iPhone/iPad: tik op Deel → "Zet op beginscherm" om te installeren.': 'iPhone/iPad: tap Share → "Add to Home Screen" to install.',
  'PDF Studio wordt geladen…': 'Loading PDF Studio…', 'ABN PDF Studio wordt geladen…': 'Loading ABN PDF Studio…'
};

/* ---------- Patronen voor teksten met getallen of namen ---------- */
const pages = (n) => `${n} page${n == 1 ? '' : 's'}`;
const files = (n) => `${n} file${n == 1 ? '' : 's'}`;
const PG = "(\\d+) pagina(?:'s)?";
const P = [
  [/^(\d+) pagina(?:'s)?$/, (m) => pages(m[1])],
  [/^(\d+) bestand(?:en|\(en\))?$/, (m) => files(m[1])],
  [/^(\d+) afbeelding(?:en|\(en\))?$/, (m) => `${m[1]} image${m[1] == 1 ? '' : 's'}`],
  [/^(\d+) afbeelding(?:en)? → (.+)$/, (m) => `${m[1]} image${m[1] == 1 ? '' : 's'} → ${tr(m[2])}`],
  [/^Bestanden \((\d+)\)$/, (m) => `Files (${m[1]})`],
  [/^(\d+) pagina(?:'s)? · (\d+[^·]*?)( · beveiligd)?$/, (m) => `${pages(m[1])} · ${m[2]}${m[3] ? ' · protected' : ''}`],
  [/^(\d+[,.]?\d* [kM]?B) · beveiligd$/, (m) => `${m[1]} · protected`],
  [/^Samengevoegd: (.+)$/, (m) => `Merged: ${tr(m[1])}`],
  [/^Gesplitst in (\d+) bestand(?:en)?$/, (m) => `Split into ${files(m[1])}`],
  [/^(\d+) geselecteerd$/, (m) => `${m[1]} selected`], [/^van (.+)$/, (m) => `of ${tr(m[1])}`],
  [/^(\d+) van (\d+) geselecteerd$/, (m) => `${m[1]} of ${m[2]} selected`],
  [/^(\d+) van (\d+) pagina(?:'s)?$/, (m) => `${m[1]} of ${pages(m[2])}`],
  [/^(\d+) te verwijderen$/, (m) => `${m[1]} to delete`], [/^(\d+) blijven over$/, (m) => `${m[1]} remain`],
  [/^(.+) geëxtraheerd(?: \((.+)\))?$/, (m) => `${tr(m[1])} extracted${m[2] ? ` (${m[2]})` : ''}`],
  [/^(.+) verwijderd — (.+) over$/, (m) => `${tr(m[1])} deleted — ${tr(m[2])} left`],
  [/^Opgeslagen: (.+)$/, (m) => `Saved: ${tr(m[1])}`], [/^(.+) gedraaid$/, (m) => `${tr(m[1])} rotated`], [/^(.+) bijgesneden$/, (m) => `${tr(m[1])} cropped`], [/^(.+) genummerd$/, (m) => `${tr(m[1])} numbered`],
  [new RegExp(`^${PG} · sleep (?:om te ordenen \\(of Alt \\+ pijltjes\\)|of gebruik de pijlen om te ordenen)$`), (m) => `${pages(m[1])} · drag or use the arrows to reorder`],
  [/^(.+) — Alt \+ pijltjes om te verplaatsen$/, (m) => `${tr(m[1])} — Alt + arrows to move`],
  [/^Pagina (\d+)$/, (m) => `Page ${m[1]}`], [/^Pagina (\d+) (selecteren|deselecteren)$/, (m) => `${m[2] === 'selecteren' ? 'Select' : 'Deselect'} page ${m[1]}`],
  [/^Ga naar pagina (\d+)$/, (m) => `Go to page ${m[1]}`],
  [/^(Bestand|Deel|Afbeelding|Pagina) (\d+) van (\d+)…$/, (m) => `${{ Bestand: 'File', Deel: 'Part', Afbeelding: 'Image', Pagina: 'Page' }[m[1]]} ${m[2]} of ${m[3]}…`],
  [/^Pagina (\d+) van (\d+) vergelijken…$/, (m) => `Comparing page ${m[1]} of ${m[2]}…`], [/^(.+): pagina (\d+) van (\d+)…$/, (m) => `${m[1]}: page ${m[2]} of ${m[3]}…`],
  [/^Alles downloaden als ZIP \((\d+)\)$/, (m) => `Download all as ZIP (${m[1]})`], [/^… en nog (\d+) bestanden \(in de ZIP\)\.$/, (m) => `… and ${m[1]} more files (in the ZIP).`],
  [/^(\d+) van (\d+) afbeeldingen opnieuw gecomprimeerd\.$/, (m) => `${m[1]} of ${m[2]} images recompressed.`],
  [/^Dit bestand is al optimaal \((.+)\)\. U kunt het origineel houden\.$/, (m) => `This file is already optimal (${m[1]}). You can keep the original.`],
  [/^(\d+) onderdelen gewist$/, (m) => `${m[1]} items removed`], [/^(\d+) van (\d+) onderdelen geselecteerd$/, (m) => `${m[1]} of ${m[2]} items selected`],
  [/^Nog aanwezig \(niet geselecteerd\): (.+)\.$/, (m) => `Still present (not selected): ${m[1].split(', ').map(tr).join(', ')}.`],
  [/^Op (\d+) plaats\(en\) — o\.a\. bewerkingsinfo van de maker-software$/, (m) => `In ${m[1]} place(s) — incl. editing info from the creating software`],
  [/^(\d+) stuks \((.+)\)$/, (m) => `${m[1]} item${m[1] == 1 ? '' : 's'} (${m[2]})`],
  [/^Watermerk op (.+)$/, (m) => `Watermark on ${tr(m[1])}`], [/^Kop- en voettekst op (.+)$/, (m) => `Header and footer on ${tr(m[1])}`],
  [/^(\d+) formulierveld\(en\) en (\d+) opmerking\(en\) vastgezet\.$/, (m) => `${m[1]} form field(s) and ${m[2]} comment(s) flattened.`],
  [/^PDF gemaakt: (.+)$/, (m) => `PDF created: ${tr(m[1])}`], [/^(\d+) afbeelding(?:en)? gemaakt$/, (m) => `${m[1]} image${m[1] == 1 ? '' : 's'} created`],
  [/^(\d+) pagina\('s\) met verschillen$/, (m) => `${m[1]} page(s) with differences`], [/^(\d+) woord\(en\) verwijderd, (\d+) toegevoegd\.$/, (m) => `${m[1]} word(s) removed, ${m[2]} added.`],
  [/^Pagina (\d+)( \(nieuw\)| \(verwijderd\))? — (\d+) woord\(en\) weg, (\d+) erbij$/, (m) => `Page ${m[1]}${m[2] ? (m[2].includes('nieuw') ? ' (new)' : ' (removed)') : ''} — ${m[3]} word(s) removed, ${m[4]} added`],
  [/^Origineel (.+), nieuw (.+)$/, (m) => `Original ${tr(m[1])}, new ${tr(m[2])}`], [/^(.+) vergeleken$/, (m) => `${tr(m[1])} compared`], [/^Origineel: (.+)$/, (m) => `Original: ${m[1]}`],
  [/^(\d+) treffers? in (\d+) van (\d+) bestand\(en\)$/, (m) => `${m[1]} match${m[1] == 1 ? '' : 'es'} in ${m[2]} of ${files(m[3])}`],
  [/^(.+) — (\d+) treffers?$/, (m) => `${m[1]} — ${m[2]} match${m[2] == 1 ? '' : 'es'}`],
  [/^Pagina (\d+) bestaat niet \(document heeft (\d+) pagina's\)$/, (m) => `Page ${m[1]} does not exist (document has ${m[2]} pages)`],
  [/^Ongeldig paginabereik: "(.*)"$/, (m) => `Invalid page range: "${m[1]}"`], [/^Leeg bereik bij (.+)\.$/, (m) => `Empty range for ${m[1]}.`],
  [/^Er ging iets mis: (.+)$/, (m) => `Something went wrong: ${tr(m[1])}`], [/^Opslaan mislukt: (.+)$/, (m) => `Saving failed: ${tr(m[1])}`],
  [/^(.+\.pdf): (.+)$/i, (m) => `${m[1]}: ${tr(m[2])}`],
  [/^Opgeslagen als (.+)$/, (m) => `Saved as ${m[1]}`], [/^(\d+) bestand\(en\) overgeslagen: verkeerd bestandstype\.$/, (m) => `${files(m[1])} skipped: wrong file type.`],
  [/^"(.+)" is beveiligd met een wachtwoord\.$/, (m) => `"${m[1]}" is protected with a password.`], [/^"(.+)" is geen geldige PDF of is beschadigd\.$/, (m) => `"${m[1]}" is not a valid PDF or is damaged.`],
  [/^"(.+)" is beveiligd; geen wachtwoord opgegeven\.$/, (m) => `"${m[1]}" is protected; no password entered.`],
  [/^(\d+) lettertype\(n\) toegevoegd\.$/, (m) => `${m[1]} font(s) added.`], [/^(\d+) lettertype\(n\) van deze computer gebruikt\.$/, (m) => `${m[1]} font(s) from this computer used.`],
  [/^Eigen lettertypen beschikbaar: (\d+)$/, (m) => `Own fonts available: ${m[1]}`],
  [/^Op pagina (.+) kon de tekst niet in het originele lettertype vervangen worden; daar is ze afgedekt en opnieuw geplaatst\.$/, (m) => `On page ${m[1]} the text could not be replaced in the original font; it was covered and placed again there.`],
  [/^Let op: (\d+) gewijzigde regel\(s\) passen niet: ze lopen voorbij de marge of overlappen met tekst ernaast \(max\. (.+) mm\)\.$/, (m) => `Note: ${m[1]} changed line(s) do not fit: they run past the margin or overlap adjacent text (max. ${m[2]} mm).`],
  [/^Deze regel loopt (.+) mm voorbij de tekstmarge\. Maak de tekst korter of de letter kleiner\.$/, (m) => `This line runs ${m[1]} mm past the text margin. Shorten the text or reduce the font size.`],
  [/^De nieuwe tekst overlapt (.+) mm met de tekst ernaast \(volgende kolom\)\. Maak de tekst korter of de letter kleiner\.$/, (m) => `The new text overlaps the adjacent text (next column) by ${m[1]} mm. Shorten the text or reduce the font size.`],
  [/^De alinea heeft (\d+) regel\(s\) meer nodig, maar daaronder staat andere inhoud\. Maak de tekst korter of de letter kleiner\.$/, (m) => `The paragraph needs ${m[1]} more line(s), but there is other content below it. Shorten the text or reduce the font size.`],
  [/^Niet alle tekens zitten in de PDF\. Voor een 100% identiek resultaat voegt u het lettertype "(.+)" toe \(bv\. uit (.+)\)\.$/, (m) => `Not all characters are in the PDF. For a 100% identical result, add the font "${m[1]}" (e.g. from ${m[2]}).`],
  [/^(.+) \(origineel\)$/, (m) => `${m[1]} (original)`], [/^(.+) \(uit de PDF\)$/, (m) => `${m[1]} (from the PDF)`], [/^(.+) \(uw lettertype\)$/, (m) => `${m[1]} (your font)`], [/^(.+) \(van deze computer\)$/, (m) => `${m[1]} (from this computer)`],
  [/^(\d+) tekens?$/, (m) => `${m[1]} character${m[1] == 1 ? '' : 's'}`], [/^(\d+) tekstfragment\(en\) vervangen\.$/, (m) => `${m[1]} text fragment(s) replaced.`],
  [/^(\d+) redactievlak\(ken\)\. Bij opslaan worden de betrokken pagina's omgezet naar een afbeelding zodat de inhoud definitief weg is\.$/, (m) => `${m[1]} redaction box(es). When saving, the pages concerned are converted to images so the content is gone for good.`],
  [/^(.+) wissen$/, (m) => `Remove ${tr(m[1])}`],
  [/^Gereedschap: (.+)$/, (m) => `Tool: ${tr(m[1])}`],
  [/^Pagina (\d+) \/ (\d+) · (\d+) wijziging\(en\)( · niet opgeslagen)?$/, (m) => `Page ${m[1]} / ${m[2]} · ${m[3]} change(s)${m[4] ? ' · not saved' : ''}`],
  [/^Lettertypes bewaren… (\d+)\/(\d+)$/, (m) => `Saving fonts… ${m[1]}/${m[2]}`],
  [/^(.+) — kies daarna "Bewaar in Bestanden"\.$/, (m) => `${m[1]} — then choose "Save to Files".`],
  [/^Geen hulpmiddel gevonden voor "(.*)"\.$/, (m) => `No tool found for "${m[1]}".`], [/^Geen voorbeeld: (.+)$/, (m) => `No preview: ${tr(m[1])}`],
  [/^(.+) – (ABN )?PDF Studio$/, (m) => `${tr(m[1])} – ${m[2] || ''}PDF Studio`],
  [/^(.+) → (.+) \(−(\d+)%\)$/, (m) => `${m[1]} → ${m[2]} (−${m[3]}%)`]
];
const REV = new Map(Object.entries(D).filter(([k, v]) => k !== v).map(([k, v]) => [v, k]));
export function tr(s) {
  if (current !== 'en' || s == null) return s;
  const lead = s.match(/^\s*/)[0], trail = s.match(/\s*$/)[0]; const k = s.trim(); if (!k) return s;
  if (k in D) return lead + D[k] + trail;
  for (const [re, fn] of P) { const m = k.match(re); if (m) { try { return lead + fn(m) + trail; } catch { return s; } } }
  return s;
}

/* ---------- Toepassen op het scherm ---------- */
const SKIP = '.ed-page,.ed-edit,.nm,.hits li,.diff,.result .out span,.fitem .info .nm,input,textarea,script,style,.ed-name,[data-notranslate]';
const ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];
const origText = new WeakMap(); const origAttr = new WeakMap();
function doText(n) {
  if (n.parentElement && n.parentElement.closest(SKIP)) return;
  const o = origText.has(n) ? origText.get(n) : n.nodeValue;
  if (current === 'en') { const t = tr(o); if (t !== o) { origText.set(n, o); if (n.nodeValue !== t) n.nodeValue = t; } }
  else if (origText.has(n)) { n.nodeValue = o; origText.delete(n); }
  else { const k = n.nodeValue.trim(); if (REV.has(k)) n.nodeValue = n.nodeValue.replace(k, REV.get(k)); }
}
function doEl(e) {
  if (e.closest(SKIP) && !e.matches('input,textarea')) return;
  if (e.matches('input,textarea') && e.closest('.ed-page')) return;
  let m = origAttr.get(e);
  for (const a of ATTRS) {
    if (!e.hasAttribute(a)) continue; const v = e.getAttribute(a);
    if (current === 'en') { const o = m && m[a] !== undefined && (tr(m[a]) === v || m[a] === v) ? m[a] : v; const t = tr(o); if (t !== o) { if (!m) { m = {}; origAttr.set(e, m); } m[a] = o; if (v !== t) e.setAttribute(a, t); } }
    else if (m && m[a] !== undefined) { e.setAttribute(a, m[a]); delete m[a]; }
  }
}
function walk(root) {
  if (root.nodeType === 3) return doText(root);
  if (root.nodeType !== 1) return;
  doEl(root);
  const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n; while ((n = it.nextNode())) { if (n.nodeType === 3) doText(n); else doEl(n); }
}
let busy = false;
const mo = new MutationObserver((list) => {
  if (busy) return; busy = true;
  try { for (const r of list) { if (r.type === 'childList') r.addedNodes.forEach(walk); else if (r.type === 'characterData') doText(r.target); else if (r.type === 'attributes') doEl(r.target); } titleFix(); } finally { busy = false; }
});
let origTitle = null;
function titleFix() { const t = document.title; if (current === 'en') { const o = origTitle && tr(origTitle) === t ? origTitle : t; origTitle = o; const n = tr(o); if (n !== t) document.title = n; } else if (origTitle && tr(origTitle) === t) { document.title = origTitle; origTitle = null; } }
export function startI18n() {
  document.documentElement.lang = current;
  mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  if (current === 'en') { busy = true; walk(document.body); titleFix(); busy = false; }
}
export function setLang(l) {
  if (l === current) return; current = l === 'en' ? 'en' : 'nl';
  try { localStorage.setItem(KEY, current); } catch {}
  document.documentElement.lang = current;
  busy = true; walk(document.body); titleFix(); busy = false;
  document.dispatchEvent(new CustomEvent('langchange', { detail: current }));
}
// Knop NL | EN voor de kopbalk
export function langSwitch(el) {
  const mk = (code) => el('button', { type: 'button', class: 'lang-opt', 'data-lang': code, 'aria-pressed': String(current === code), lang: code, 'aria-label': code === 'nl' ? 'Nederlands' : 'English', onclick: () => { setLang(code); paint(); } }, code.toUpperCase());
  const nl = mk('nl'), en = mk('en');
  const wrap = el('div', { class: 'lang-switch', role: 'group', 'aria-label': 'Taal / Language', 'data-notranslate': '' }, nl, en);
  const paint = () => { nl.setAttribute('aria-pressed', String(current === 'nl')); en.setAttribute('aria-pressed', String(current === 'en')); };
  return wrap;
}
