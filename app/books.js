// books.js - Bible book names (English + Yoruba) and a reference reader such as "John 3:16-18" or "Johanu 3".
(function () {
  const BOOKS = [["GEN","Genesis","Gẹnẹsisi",["gen","ge","gn"]],["EXO","Exodus","Eksodu",["exod","ex","exo"]],["LEV","Leviticus","Lefitiku",["lev","le","lv"]],["NUM","Numbers","Numeri",["num","nu","nm"]],["DEU","Deuteronomy","Deuteronomi",["deut","dt","de"]],["JOS","Joshua","Joṣua",["josh","jos"]],["JDG","Judges","Onidajọ",["judg","jdg","jg"]],["RUT","Ruth","Rutu",["ru","rut"]],["1SA","1 Samuel","1 Samuẹli",["1sam","1sa","1s"]],["2SA","2 Samuel","2 Samuẹli",["2sam","2sa","2s"]],["1KI","1 Kings","1 Ọba",["1kgs","1ki","1k"]],["2KI","2 Kings","2 Ọba",["2kgs","2ki","2k"]],["1CH","1 Chronicles","1 Kronika",["1chron","1chr","1ch"]],["2CH","2 Chronicles","2 Kronika",["2chron","2chr","2ch"]],["EZR","Ezra","Esra",["ezr"]],["NEH","Nehemiah","Nehemiah",["neh"]],["EST","Esther","Esteri",["esth","est"]],["JOB","Job","Jobu",["jb"]],["PSA","Psalms","Saamu",["psalm","ps","psa","pslm"]],["PRO","Proverbs","Òwe",["prov","pr","pro"]],["ECC","Ecclesiastes","Oniwaasu",["eccl","ecc","qoh"]],["SNG","Song of Solomon","Orin Solomoni",["song","songofsongs","sos","canticles"]],["ISA","Isaiah","Isaiah",["isa","is"]],["JER","Jeremiah","Jeremiah",["jer"]],["LAM","Lamentations","Ẹkún Jeremiah",["lam"]],["EZK","Ezekiel","Esekiẹli",["ezek","eze","ezk"]],["DAN","Daniel","Daniẹli",["dan","dn"]],["HOS","Hosea","Hosea",["hos"]],["JOL","Joel","Joẹli",["joe","jl"]],["AMO","Amos","Amosi",["am","amo"]],["OBA","Obadiah","Obadiah",["obad","oba","ob"]],["JON","Jonah","Jona",["jnh","jon"]],["MIC","Micah","Mika",["mic"]],["NAM","Nahum","Nahumu",["nah","na"]],["HAB","Habakkuk","Habakuku",["hab"]],["ZEP","Zephaniah","Sefaniah",["zeph","zep"]],["HAG","Haggai","Hagai",["hag"]],["ZEC","Zechariah","Sekariah",["zech","zec"]],["MAL","Malachi","Malaki",["mal"]],["MAT","Matthew","Matiu",["matt","mt"]],["MRK","Mark","Marku",["mk","mar","mrk"]],["LUK","Luke","Luku",["lk","luk"]],["JHN","John","Johanu",["jn","jhn","joh"]],["ACT","Acts","Ìṣe àwọn Aposteli",["ac","act"]],["ROM","Romans","Romu",["rom","ro","rm"]],["1CO","1 Corinthians","1 Kọrinti",["1cor","1co"]],["2CO","2 Corinthians","2 Kọrinti",["2cor","2co"]],["GAL","Galatians","Galatia",["gal","ga"]],["EPH","Ephesians","Efesu",["eph"]],["PHP","Philippians","Filipi",["phil","php"]],["COL","Colossians","Kolose",["col"]],["1TH","1 Thessalonians","1 Tẹsalonika",["1thess","1th"]],["2TH","2 Thessalonians","2 Tẹsalonika",["2thess","2th"]],["1TI","1 Timothy","1 Timotiu",["1tim","1ti"]],["2TI","2 Timothy","2 Timotiu",["2tim","2ti"]],["TIT","Titus","Titu",["tit"]],["PHM","Philemon","Filemoni",["philem","phm"]],["HEB","Hebrews","Heberu",["heb"]],["JAS","James","Jakọbu",["jas","jm"]],["1PE","1 Peter","1 Peteru",["1pet","1pe"]],["2PE","2 Peter","2 Peteru",["2pet","2pe"]],["1JN","1 John","1 Johanu",["1jn","1joh","1jo"]],["2JN","2 John","2 Johanu",["2jn","2joh","2jo"]],["3JN","3 John","3 Johanu",["3jn","3joh","3jo"]],["JUD","Jude","Juda",["jud"]],["REV","Revelation","Ìfihàn",["rev","re"]]];
  const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  const index = [];
  BOOKS.forEach(b => { [b[1], b[2], ...b[3]].forEach(n => index.push([norm(n), b])); });
  function findBook(name) {
    const n = norm(name); if (!n) return null;
    let hit = index.find(x => x[0] === n); if (hit) return hit[1];
    const cands = [...new Set(index.filter(x => x[0].startsWith(n)).map(x => x[1]))];
    return cands.length === 1 ? cands[0] : (n.length >= 3 && cands.length ? cands[0] : null);
  }
  // returns { book:[id,english,yoruba,aliases], chapter, from, to } or null
  function parseRef(text) {
    const m = String(text).trim().match(/^(.+?)\s*(\d+)(?:\s*[:.]\s*(\d+)(?:\s*[-–]\s*(\d+))?)?$/);
    if (!m) return null;
    const book = findBook(m[1].replace(/^(the\s+)?book\s+of\s+/i, '')); if (!book) return null;
    const from = m[3] ? Number(m[3]) : null, to = m[4] ? Number(m[4]) : from;
    return { book, chapter: Number(m[2]), from, to };
  }
  window.Books = { BOOKS, findBook, parseRef };
})();
