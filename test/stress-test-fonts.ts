
import { downloadAndRegisterFont, getCacheStats, clearMemoryCache, clearFailedFonts } from '../src/lib/dynamic-font-loader';

const GOOGLE_FONTS_API_URL = 'https://www.googleapis.com/webfonts/v1/webfonts?key=AIzaSyASyrd0FqUGh1DaJ2Z4W_l8xk2y17N_6jA&sort=popularity';

async function fetchAllGoogleFonts(): Promise<string[]> {
  try {
    console.log(`Fetching complete font list from Google Fonts API...`);
    const response = await fetch(GOOGLE_FONTS_API_URL, {
      headers: {
        'accept': '*/*',
        'accept-language': 'en-US,en;q=0.9',
        'origin': 'http://localhost:3000',
        'referer': 'http://localhost:3000/',
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch font list: HTTP ${response.status}`);
    }
    
    const data = await response.json();
    const fontFamilies = data.items.map((font: any) => font.family);
    console.log(`✅ Successfully fetched ${fontFamilies.length} font families from Google Fonts API.`);
    return fontFamilies;
  } catch (error) {
    console.error('❌ Error fetching Google Fonts list:', error);
    return [];
  }
}

async function stressTestFonts() {
  console.log('--- Starting Font Loader Stress Test ---');
  console.log('This test will fetch ALL fonts from Google Fonts API and test each one.\n');

  const allFonts = await fetchAllGoogleFonts();
  if (allFonts.length === 0) {
    console.error('Could not retrieve font list. Aborting test.');
    return;
  }

  const fontsToTest = allFonts; // Test ALL fonts from the API
  console.log(`\nTesting ALL ${fontsToTest.length} fonts from Google Fonts. Starting download process...\n`);

  const failedFonts: string[] = [];
  const successFonts: string[] = [];

  const promises = fontsToTest.map(fontName =>
    downloadAndRegisterFont(fontName, fontName)
      .then(success => {
        if (success) {
          successFonts.push(fontName);
        } else {
          failedFonts.push(fontName);
        }
      })
      .catch(() => {
        failedFonts.push(fontName);
      })
  );

  // Process in chunks to avoid overwhelming the network
  const chunkSize = 50;
  for (let i = 0; i < promises.length; i += chunkSize) {
    const chunk = promises.slice(i, i + chunkSize);
    await Promise.all(chunk);
    console.log(`Processed ${i + chunk.length}/${promises.length} fonts...`);
  }

  console.log('\n--- Test Results ---');
  console.log(`✅ Successfully loaded: ${successFonts.length} fonts`);
  console.log(`❌ Failed to load: ${failedFonts.length} fonts`);

  if (failedFonts.length > 0) {
    console.log('\nFailed fonts:');
    failedFonts.forEach(font => console.log(`  - ${font}`));
  }

  console.log('\nCache Stats:');
  console.log(JSON.stringify(getCacheStats(), null, 2));

  // Cleanup
  clearMemoryCache();
  clearFailedFonts();

  console.log('\n--- Test Complete ---');
}

stressTestFonts().catch(error => {
  console.error('An unexpected error occurred during the test:', error);
});
