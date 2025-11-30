import sharp from 'sharp';

/**
 * Hash type identifier
 */
export type HashType = 'full' | 'center' | 'square';

/**
 * Hash result with metadata
 */
export interface HashResult {
  hash: string;
  type: HashType;
}

/**
 * Generates a perceptual hash for an image using sharp
 * @param buffer - Image file buffer
 * @returns 16-character hex hash string
 */
export async function generateImageHash(buffer: Buffer): Promise<string> {
  try {
    // Resize to 8x8 and convert to grayscale
    const { data } = await sharp(buffer)
      .resize(8, 8, {
        fit: 'fill',
        kernel: sharp.kernel.nearest,
      })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Calculate average pixel value
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i];
    }
    const average = sum / data.length;

    // Create binary hash based on whether each pixel is above or below average
    let binaryHash = '';
    for (let i = 0; i < data.length; i++) {
      binaryHash += data[i] >= average ? '1' : '0';
    }

    // Convert binary to hex (16 characters for 64 bits)
    let hexHash = '';
    for (let i = 0; i < binaryHash.length; i += 4) {
      const chunk = binaryHash.substring(i, i + 4);
      hexHash += parseInt(chunk, 2).toString(16);
    }
    
    return hexHash;
  } catch (error) {
    console.error('Error generating image hash:', error);
    throw new Error('Failed to generate image hash');
  }
}

/**
 * Generates multiple perceptual hashes for robust matching
 * Creates 3 hashes: full, center-cropped, and square-cropped
 * 
 * @param buffer - Image file buffer
 * @returns Array of hash strings [full, center, square]
 */
export async function generateMultiHashes(buffer: Buffer): Promise<string[]> {
  try {
    const metadata = await sharp(buffer).metadata();
    const width = metadata.width || 0;
    const height = metadata.height || 0;

    if (width === 0 || height === 0) {
      throw new Error('Invalid image dimensions');
    }

    // 1. FULL HASH: Original image
    const fullHash = await generateImageHash(buffer);

    // 2. CENTER HASH: Crop 10% from top and bottom (removes status bars)
    const cropTop = Math.floor(height * 0.1);
    const cropBottom = Math.floor(height * 0.1);
    const centerHeight = height - cropTop - cropBottom;
    
    const centerCropped = await sharp(buffer)
      .extract({
        left: 0,
        top: cropTop,
        width: width,
        height: centerHeight,
      })
      .toBuffer();
    
    const centerHash = await generateImageHash(centerCropped);

    // 3. SQUARE HASH: Crop to center square (for Instagram/FB posts)
    const squareSize = Math.min(width, height);
    const squareLeft = Math.floor((width - squareSize) / 2);
    const squareTop = Math.floor((height - squareSize) / 2);
    
    const squareCropped = await sharp(buffer)
      .extract({
        left: squareLeft,
        top: squareTop,
        width: squareSize,
        height: squareSize,
      })
      .toBuffer();
    
    const squareHash = await generateImageHash(squareCropped);

    console.log('📸 Generated multi-hashes:', {
      full: fullHash,
      center: centerHash,
      square: squareHash,
    });

    return [fullHash, centerHash, squareHash];
  } catch (error) {
    console.error('Error generating multi-hashes:', error);
    throw new Error('Failed to generate multi-hashes');
  }
}

/**
 * Calculates Hamming distance between two hashes
 * Used to determine similarity between images
 * @param hash1 - First hash
 * @param hash2 - Second hash
 * @returns Distance (0 = identical, higher = more different)
 */
export function calculateHammingDistance(
  hash1: string,
  hash2: string
): number {
  if (hash1.length !== hash2.length) {
    throw new Error('Hashes must be the same length');
  }

  let distance = 0;
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] !== hash2[i]) {
      distance++;
    }
  }

  return distance;
}

/**
 * Checks if two images are similar based on hash distance
 * @param hash1 - First hash
 * @param hash2 - Second hash
 * @param threshold - Maximum distance to consider similar (default: 5)
 * @returns true if images are similar
 */
export function areImagesSimilar(
  hash1: string,
  hash2: string,
  threshold: number = 5
): boolean {
  const distance = calculateHammingDistance(hash1, hash2);
  return distance <= threshold;
}
