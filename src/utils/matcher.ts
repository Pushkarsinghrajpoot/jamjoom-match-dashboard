import { compareTwoStrings } from 'string-similarity';

export interface MatchResult {
  itemMasterRow: any;
  genConsumableRow: any;
  matchPercentage: number;
  itemMasterDescription: string;
  genConsumableDescription: string;
}

/**
 * Clean and normalize string for better matching
 */
const normalizeString = (str: string): string => {
  if (!str) return '';
  return str
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '');
};

/**
 * Calculate similarity between two descriptions
 */
export const calculateSimilarity = (desc1: string, desc2: string): number => {
  const normalized1 = normalizeString(desc1);
  const normalized2 = normalizeString(desc2);
  
  if (!normalized1 || !normalized2) return 0;
  
  const similarity = compareTwoStrings(normalized1, normalized2);
  return Math.round(similarity * 10000) / 100; // Return percentage with 2 decimal places
};

/**
 * Match items from both files based on description similarity
 * Optimized with early exit and result limiting
 */
export const matchDescriptions = (
  itemMasterData: any[],
  genConsumableData: any[],
  minThreshold: number = 0,
  maxResults: number = 1000
): MatchResult[] => {
  const matches: MatchResult[] = [];
  
  // Only keep top matches above threshold
  for (let i = 0; i < itemMasterData.length; i++) {
    const itemRow = itemMasterData[i];
    const itemDesc = itemRow['Description'] || '';
    if (!itemDesc) continue;
    
    for (let j = 0; j < genConsumableData.length; j++) {
      const genRow = genConsumableData[j];
      const genDesc = genRow['LONG DESCRIPTION'] || '';
      if (!genDesc) continue;
      
      const matchPercentage = calculateSimilarity(itemDesc, genDesc);
      
      if (matchPercentage >= minThreshold) {
        matches.push({
          itemMasterRow: itemRow,
          genConsumableRow: genRow,
          matchPercentage,
          itemMasterDescription: itemDesc,
          genConsumableDescription: genDesc,
        });
      }
    }
  }
  
  // Sort by match percentage descending and limit results
  return matches
    .sort((a, b) => b.matchPercentage - a.matchPercentage)
    .slice(0, maxResults);
};

/**
 * Extract meaningful tokens from description
 */
const extractTokens = (text: string): Set<string> => {
  const normalized = normalizeString(text);
  const tokens = normalized.split(/\s+/).filter(token => token.length >= 3);
  return new Set(tokens);
};

/**
 * Calculate token overlap score (fast pre-filter)
 */
const calculateTokenOverlap = (tokens1: Set<string>, tokens2: Set<string>): number => {
  if (tokens1.size === 0 || tokens2.size === 0) return 0;
  
  let overlap = 0;
  tokens1.forEach(token => {
    if (tokens2.has(token)) overlap++;
  });
  
  const union = tokens1.size + tokens2.size - overlap;
  return union > 0 ? (overlap / union) : 0;
};

/**
 * ULTRA-OPTIMIZED async version with token-based pre-filtering
 * Reduces 14M+ comparisons to only relevant candidates
 */
export const matchDescriptionsAsync = async (
  itemMasterData: any[],
  genConsumableData: any[],
  minThreshold: number = 0,
  maxResults: number = 1000,
  onProgress?: (progress: number) => void
): Promise<MatchResult[]> => {
  return new Promise((resolve) => {
    console.time('Total Matching Time');
    const matches: MatchResult[] = [];
    const chunkSize = 200; // Larger chunks for faster processing
    let currentIndex = 0;
    
    console.log(`Starting match with ${itemMasterData.length} items vs ${genConsumableData.length} consumables`);
    
    // Pre-process and tokenize all data once
    console.time('Pre-processing');
    const normalizedItemData = itemMasterData
      .map((row, idx) => {
        const desc = row['Description'] || '';
        const normalized = normalizeString(desc);
        return {
          row,
          desc,
          normalizedDesc: normalized,
          tokens: extractTokens(desc),
          index: idx
        };
      })
      .filter(item => item.normalizedDesc.length > 0 && item.tokens.size > 0);
    
    const normalizedGenData = genConsumableData
      .map((row, idx) => {
        const desc = row['LONG DESCRIPTION'] || '';
        const normalized = normalizeString(desc);
        return {
          row,
          desc,
          normalizedDesc: normalized,
          tokens: extractTokens(desc),
          index: idx
        };
      })
      .filter(item => item.normalizedDesc.length > 0 && item.tokens.size > 0);
    
    console.timeEnd('Pre-processing');
    console.log(`Pre-processed: ${normalizedItemData.length} items, ${normalizedGenData.length} consumables`);
    
    const processChunk = () => {
      const startTime = Date.now();
      const endIndex = Math.min(currentIndex + chunkSize, normalizedItemData.length);
      
      for (let i = currentIndex; i < endIndex; i++) {
        const itemData = normalizedItemData[i];
        
        // OPTIMIZATION 1: Token-based pre-filtering - only compare if significant token overlap
        const candidates = normalizedGenData.filter(genData => {
          // Quick length check first (fastest filter)
          const lengthRatio = Math.min(itemData.normalizedDesc.length, genData.normalizedDesc.length) /
                            Math.max(itemData.normalizedDesc.length, genData.normalizedDesc.length);
          if (lengthRatio < 0.3) return false; // Skip if length difference is too large
          
          // Token overlap check (still fast, much faster than full string comparison)
          const tokenOverlap = calculateTokenOverlap(itemData.tokens, genData.tokens);
          return tokenOverlap > 0.15; // Only compare if at least 15% token overlap
        });
        
        // OPTIMIZATION 2: Only do expensive string comparison on filtered candidates
        for (const genData of candidates) {
          const matchPercentage = compareTwoStrings(itemData.normalizedDesc, genData.normalizedDesc) * 100;
          
          if (matchPercentage >= minThreshold) {
            matches.push({
              itemMasterRow: itemData.row,
              genConsumableRow: genData.row,
              matchPercentage: Math.round(matchPercentage * 100) / 100,
              itemMasterDescription: itemData.desc,
              genConsumableDescription: genData.desc,
            });
            
            // OPTIMIZATION 3: Early exit on perfect match
            if (matchPercentage >= 98) break;
          }
        }
      }
      
      currentIndex = endIndex;
      const progress = Math.round((currentIndex / normalizedItemData.length) * 100);
      const elapsed = Date.now() - startTime;
      
      if (onProgress) {
        onProgress(progress);
      }
      
      // Log progress every 20%
      if (progress % 20 === 0 || progress === 100) {
        console.log(`Progress: ${progress}%, Matches found: ${matches.length}, Chunk time: ${elapsed}ms`);
      }
      
      // OPTIMIZATION 4: Early exit if we have enough excellent matches
      if (matches.length >= maxResults * 3 && minThreshold >= 70) {
        console.log(`Early exit: Found ${matches.length} matches (target: ${maxResults})`);
        const sorted = matches
          .sort((a, b) => b.matchPercentage - a.matchPercentage)
          .slice(0, maxResults);
        console.timeEnd('Total Matching Time');
        resolve(sorted);
        return;
      }
      
      if (currentIndex < normalizedItemData.length) {
        // Continue processing in next tick
        setTimeout(processChunk, 0);
      } else {
        // Done processing, sort and return top results
        console.log(`Processing complete: ${matches.length} total matches found`);
        const sorted = matches
          .sort((a, b) => b.matchPercentage - a.matchPercentage)
          .slice(0, maxResults);
        console.timeEnd('Total Matching Time');
        console.log(`Returning top ${sorted.length} matches`);
        resolve(sorted);
      }
    };
    
    processChunk();
  });
};
