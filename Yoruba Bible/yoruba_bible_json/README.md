# Yoruba Bible Downloader

A Node.js script to download the entire Yoruba Bible book by book from the [Bible API](https://bible.helloao.org/api/).

## Features

- 📚 Downloads all 66 books of the Yoruba Bible
- 📄 Downloads each chapter individually in JSON format
- 🗂️ Organizes files by book in separate directories
- ⏱️ Includes rate limiting to respect API limits
- 📊 Provides progress tracking and error handling
- 📋 Generates a summary file with all book information

## Installation

1. Install Node.js (if not already installed)
2. Install dependencies:

```bash
npm install
```

## Usage

Run the download script:

```bash
npm start
```

Or directly with Node.js:

```bash
node download-bible.js
```

## Output Structure

The script creates the following directory structure:

```
yoruba-bible/
├── summary.json          # Overview of all books and download info
├── GEN/                  # Genesis
│   └── GEN.json
├── EXO/                  # Exodus
│   └── EXO.json
├── LEV/                  # Leviticus
│   └── LEV.json
└── ... (all 66 books)
```

## File Format

Each book JSON file contains:

```json
{
  "bookInfo": {
    "id": "GEN",
    "name": "Gẹnẹsisi",
    "title": "Ìwé Gẹnẹsisi",
    "numberOfChapters": 50,
    "totalNumberOfVerses": 1533
  },
  "chapters": {
    "1": {
      "book": "GEN",
      "chapter": 1,
      "verses": {
        "1": "Ní ìbẹ̀rẹ̀, Ọlọ́run dá ọ̀run àti ayé.",
        "2": "Ayé sì wà ní àìlọ́kàn, ó sì wà ní òkùnkùn lórí omi gbígbọn; ẹ̀mí Ọlọ́run sì ń rìn kiri lórí omi."
        // ... more verses
      }
    },
    "2": {
      /* chapter 2 data */
    }
    // ... all chapters
  }
}
```

## Configuration

You can modify the following constants in `download-bible.js`:

- `DELAY_BETWEEN_REQUESTS`: Time delay between API requests (default: 1000ms)
- `OUTPUT_DIR`: Output directory name (default: './yoruba-bible')
- `TRANSLATION_ID`: Bible translation ID (default: 'yor_bib')

## API Information

This script uses the Bible API from [bible.helloao.org](https://bible.helloao.org/api/):

- **Translation ID**: `yor_bib`
- **Language**: Yoruba (Èdè Yorùbá)
- **Total Books**: 66
- **Total Chapters**: 1,189
- **Total Verses**: 31,087

## License

The Yoruba Bible text is provided under the Biblica® license. Please refer to the [API documentation](https://bible.helloao.org/api/) for licensing details.

## Error Handling

The script includes comprehensive error handling:

- Continues downloading other books if one fails
- Logs detailed error messages
- Provides a final summary of successful and failed downloads
- Creates partial downloads if some chapters fail

## Rate Limiting

The script includes a 1-second delay between requests to be respectful to the API server. You can adjust this in the configuration if needed.
