const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

// Configuration
const BASE_URL = "https://bible.helloao.org/api";
const TRANSLATION_ID = "yor_bib";
const OUTPUT_DIR = "./yoruba-bible";
const DELAY_BETWEEN_REQUESTS = 1000; // 1 second delay to be respectful to the API

// Create delay function
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Create output directory
async function createOutputDirectory() {
  try {
    await fs.ensureDir(OUTPUT_DIR);
    console.log(`✅ Created output directory: ${OUTPUT_DIR}`);
  } catch (error) {
    console.error("❌ Error creating output directory:", error.message);
    process.exit(1);
  }
}

// Fetch books list
async function fetchBooksList() {
  try {
    console.log("📚 Fetching books list...");
    const response = await axios.get(
      `${BASE_URL}/${TRANSLATION_ID}/books.json`
    );
    return response.data.books;
  } catch (error) {
    console.error("❌ Error fetching books list:", error.message);
    throw error;
  }
}

// Download a single chapter
async function downloadChapter(bookId, chapterNumber) {
  try {
    const url = `${BASE_URL}/${TRANSLATION_ID}/${bookId}/${chapterNumber}.json`;
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error(
      `❌ Error downloading ${bookId} chapter ${chapterNumber}:`,
      error.message
    );
    throw error;
  }
}

// Download all chapters for a book
async function downloadBook(book) {
  const { id: bookId, name: bookName, numberOfChapters } = book;
  const bookDir = path.join(OUTPUT_DIR, bookId);

  try {
    // Create book directory
    await fs.ensureDir(bookDir);

    console.log(
      `\n📖 Downloading ${bookName} (${bookId}) - ${numberOfChapters} chapters...`
    );

    const bookData = {
      bookInfo: book,
      chapters: {},
    };

    // Download each chapter
    for (let chapterNum = 1; chapterNum <= numberOfChapters; chapterNum++) {
      try {
        console.log(
          `  📄 Downloading chapter ${chapterNum}/${numberOfChapters}...`
        );
        const chapterData = await downloadChapter(bookId, chapterNum);
        bookData.chapters[chapterNum] = chapterData;

        // Add delay between requests
        if (chapterNum < numberOfChapters) {
          await delay(DELAY_BETWEEN_REQUESTS);
        }
      } catch (error) {
        console.error(
          `  ❌ Failed to download chapter ${chapterNum}:`,
          error.message
        );
        // Continue with next chapter instead of failing completely
        bookData.chapters[chapterNum] = { error: error.message };
      }
    }

    // Save book data to JSON file
    const bookFilePath = path.join(bookDir, `${bookId}.json`);
    await fs.writeJson(bookFilePath, bookData, { spaces: 2 });

    console.log(`✅ Completed ${bookName} - saved to ${bookFilePath}`);
    return true;
  } catch (error) {
    console.error(`❌ Error downloading book ${bookName}:`, error.message);
    return false;
  }
}

// Download entire Bible
async function downloadEntireBible() {
  try {
    console.log("🚀 Starting Yoruba Bible download...\n");

    // Create output directory
    await createOutputDirectory();

    // Get books list
    const books = await fetchBooksList();
    console.log(`📚 Found ${books.length} books in Yoruba Bible\n`);

    // Create summary file
    const summary = {
      translation: {
        id: TRANSLATION_ID,
        name: "Yoruba Bible",
        totalBooks: books.length,
        downloadDate: new Date().toISOString(),
      },
      books: books.map((book) => ({
        id: book.id,
        name: book.name,
        title: book.title,
        numberOfChapters: book.numberOfChapters,
        totalVerses: book.totalNumberOfVerses,
      })),
    };

    // Download each book
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < books.length; i++) {
      const book = books[i];
      const success = await downloadBook(book);

      if (success) {
        successCount++;
      } else {
        failCount++;
      }

      // Add delay between books
      if (i < books.length - 1) {
        await delay(DELAY_BETWEEN_REQUESTS);
      }
    }

    // Save summary
    const summaryPath = path.join(OUTPUT_DIR, "summary.json");
    await fs.writeJson(summaryPath, summary, { spaces: 2 });

    // Print final results
    console.log("\n🎉 Download completed!");
    console.log(`✅ Successfully downloaded: ${successCount} books`);
    console.log(`❌ Failed downloads: ${failCount} books`);
    console.log(`📁 Output directory: ${OUTPUT_DIR}`);
    console.log(`📋 Summary saved to: ${summaryPath}`);

    if (failCount > 0) {
      console.log(
        "\n⚠️  Some books failed to download. Check the logs above for details."
      );
    }
  } catch (error) {
    console.error("❌ Fatal error during download:", error.message);
    process.exit(1);
  }
}

// Run the download
if (require.main === module) {
  downloadEntireBible();
}

module.exports = {
  downloadEntireBible,
  downloadBook,
  fetchBooksList,
};
