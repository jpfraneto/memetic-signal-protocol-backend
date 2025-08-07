import * as fs from 'fs';
import * as path from 'path';

interface Signaler {
  fid: number;
  username: string;
  pfpUrl: string;
}

interface InitialSeed {
  signalers: Signaler[];
}

async function fetchCastsForUser(fid: number): Promise<any[]> {
  const apiKey = process.env.NEYNAR_API_KEY;
  console.log('=== Starting API fetch for FID:', fid);
  console.log('API Key:', apiKey);
  const allCasts: any[] = [];
  let cursor: string | undefined;
  let pageCount = 0;

  while (true) {
    pageCount++;
    const url = `https://api.neynar.com/v2/farcaster/feed/user/casts/?limit=100&include_replies=true&fid=${fid}${cursor ? `&cursor=${cursor}` : ''}`;

    console.log(`\n--- Fetching page ${pageCount} for FID ${fid} ---`);
    console.log('URL:', url);
    if (cursor) {
      console.log('Using cursor:', cursor);
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'x-neynar-experimental': 'false',
      },
    });

    console.log('Response status:', response.status);
    console.log(
      'Response headers:',
      Object.fromEntries(response.headers.entries()),
    );

    if (!response.ok) {
      console.error(
        'API request failed:',
        response.status,
        response.statusText,
      );
      const errorText = await response.text();
      console.error('Error response:', errorText);
      break;
    }

    const data = await response.json();
    console.log('Response data keys:', Object.keys(data));
    console.log('Total casts in response:', data.casts ? data.casts.length : 0);

    if (data.casts && data.casts.length > 0) {
      console.log('Processing casts...');
      data.casts.forEach((cast: any, index: number) => {
        console.log(`  Cast ${index + 1}:`);
        console.log(`    Hash: ${cast.hash}`);
        console.log(
          `    Text: ${cast.text?.substring(0, 100)}${cast.text?.length > 100 ? '...' : ''}`,
        );
        console.log(`    Timestamp: ${cast.timestamp}`);
        console.log(`    Replies: ${cast.replies?.count || 0}`);
        console.log(`    Reactions: ${cast.reactions?.count || 0}`);
        console.log(`    Recasts: ${cast.recasts?.count || 0}`);
      });

      allCasts.push(...data.casts);
      console.log(
        `Added ${data.casts.length} casts to collection. Total so far: ${allCasts.length}`,
      );
    } else {
      console.log('No casts found in this response');
    }

    if (data.next && data.next.cursor) {
      cursor = data.next.cursor;
      console.log('Next cursor available:', cursor);
    } else {
      console.log('No more pages available');
      break;
    }
  }

  console.log(`\n=== Completed fetching for FID ${fid} ===`);
  console.log(`Total casts collected: ${allCasts.length}`);
  console.log(`Total pages processed: ${pageCount}`);

  return allCasts;
}

function saveCasts(fid: number, casts: any[]): void {
  console.log(`\n=== Saving casts for FID ${fid} ===`);

  const outputDir = path.join(__dirname, 'casts');
  console.log('Output directory:', outputDir);

  if (!fs.existsSync(outputDir)) {
    console.log('Creating output directory...');
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const userDir = path.join(outputDir, fid.toString());
  console.log('User directory:', userDir);

  if (!fs.existsSync(userDir)) {
    console.log('Creating user directory...');
    fs.mkdirSync(userDir, { recursive: true });
  }

  const filePath = path.join(userDir, 'casts.json');
  console.log('File path:', filePath);

  try {
    // Log some statistics about the casts being saved
    const validTimestamps = casts
      .filter((c) => c.timestamp && !isNaN(c.timestamp) && c.timestamp > 0)
      .map((c) => c.timestamp);

    const castStats = {
      totalCasts: casts.length,
      withText: casts.filter((c) => c.text && c.text.trim()).length,
      withReplies: casts.filter((c) => c.replies?.count > 0).length,
      withReactions: casts.filter((c) => c.reactions?.count > 0).length,
      withRecasts: casts.filter((c) => c.recasts?.count > 0).length,
      withValidTimestamp: validTimestamps.length,
      withInvalidTimestamp: casts.length - validTimestamps.length,
      dateRange: {
        earliest:
          validTimestamps.length > 0
            ? new Date(Math.min(...validTimestamps)).toISOString()
            : null,
        latest:
          validTimestamps.length > 0
            ? new Date(Math.max(...validTimestamps)).toISOString()
            : null,
      },
    };

    console.log('Cast statistics:', JSON.stringify(castStats, null, 2));

    // Log details about invalid timestamps if any exist
    if (castStats.withInvalidTimestamp > 0) {
      console.log('\nWarning: Found casts with invalid timestamps:');
      casts.forEach((cast, index) => {
        if (!cast.timestamp || isNaN(cast.timestamp) || cast.timestamp <= 0) {
          console.log(
            `  Cast ${index + 1}: Hash=${cast.hash}, Invalid timestamp=${cast.timestamp}`,
          );
        }
      });
    }
  } catch (error) {
    console.error('Error calculating statistics:', error);
    console.log('Continuing with file save despite statistics error...');
  }

  // Save the casts file - this is the critical operation
  try {
    fs.writeFileSync(filePath, JSON.stringify(casts, null, 2));
    console.log(`Successfully saved ${casts.length} casts for FID ${fid}`);
    console.log(
      `File size: ${(fs.statSync(filePath).size / 1024).toFixed(2)} KB`,
    );
  } catch (error) {
    console.error('Error saving casts file:', error);
    throw error; // Re-throw this error as it's critical
  }
}

async function fetchAllCasts(): Promise<void> {
  console.log('=== Starting fetchAllCasts process ===');

  const seedFilePath = path.join(__dirname, 'initial-seed.json');
  console.log('Reading seed file:', seedFilePath);

  const seedData: InitialSeed = JSON.parse(
    fs.readFileSync(seedFilePath, 'utf8'),
  );

  console.log('Seed data loaded successfully');
  console.log('Total signalers to process:', seedData.signalers.length);
  console.log(
    'Signalers:',
    seedData.signalers.map((s) => `${s.username} (FID: ${s.fid})`),
  );

  let processedCount = 0;
  const startTime = Date.now();

  for (const signaller of seedData.signalers) {
    processedCount++;
    console.log(`\n${'='.repeat(60)}`);
    console.log(
      `Processing signaller ${processedCount}/${seedData.signalers.length}: ${signaller.username} (FID: ${signaller.fid})`,
    );
    console.log(`Profile picture: ${signaller.pfpUrl}`);
    console.log(`${'='.repeat(60)}`);

    const userStartTime = Date.now();

    try {
      const casts = await fetchCastsForUser(signaller.fid);
      saveCasts(signaller.fid, casts);

      const userEndTime = Date.now();
      const userDuration = (userEndTime - userStartTime) / 1000;
      console.log(
        `Completed processing ${signaller.username} in ${userDuration.toFixed(2)} seconds`,
      );
    } catch (error) {
      console.error(
        `Error processing ${signaller.username} (FID: ${signaller.fid}):`,
        error,
      );
    }
  }

  const totalEndTime = Date.now();
  const totalDuration = (totalEndTime - startTime) / 1000;

  console.log(`\n${'='.repeat(60)}`);
  console.log('=== PROCESSING COMPLETE ===');
  console.log(`Total time: ${totalDuration.toFixed(2)} seconds`);
  console.log(`Processed ${processedCount} signalers`);
  console.log(
    `Average time per signaller: ${(totalDuration / processedCount).toFixed(2)} seconds`,
  );
  console.log(`${'='.repeat(60)}`);
}

fetchAllCasts();
