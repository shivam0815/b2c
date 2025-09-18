

import os from 'os';
import path from 'path';
import { uploadOnServer, multiUploadOnServer, deleteImageFromLocalStorage } from './uploadOnServer';

// Types
export interface CloudinaryUploadResult {
  url: string;
  path: string;
}
export interface CloudinaryError {
  message: string;
}

export interface ImageTransformOptions {
  width?: number;
  height?: number;
  crop?: 'fill' | 'fit' | 'limit' | 'scale' | 'crop';
  quality?: 'auto' | number;
  format?: 'auto' | 'jpg' | 'png' | 'webp';
  gravity?: 'auto' | 'face' | 'center';
}

export interface UploadOptions {
  folder?: string;
  public_id?: string;
  resource_type?: 'image' | 'video' | 'raw' | 'auto';
  transformation?: ImageTransformOptions;
  tags?: string[];
  context?: Record<string, string>;
}

// Image transformation presets for ecommerce
export const IMAGE_TRANSFORMATIONS = {
  thumbnail: { width: 150, height: 150, crop: 'fill', quality: 'auto', format: 'auto' },
  small: { width: 300, height: 300, crop: 'fill', quality: 'auto', format: 'auto' },
  medium: { width: 600, height: 600, crop: 'fill', quality: 'auto', format: 'auto' },
  large: { width: 1200, height: 1200, crop: 'limit', quality: 'auto', format: 'auto' },
  hero: { width: 1920, height: 1080, crop: 'fill', quality: 'auto', format: 'auto' },
  // Product-specific transformations
  productThumbnail: { width: 200, height: 200, crop: 'fill', quality: 'auto', format: 'auto', gravity: 'auto' },
  productMedium: { width: 500, height: 500, crop: 'fill', quality: 'auto', format: 'auto', gravity: 'auto' },
  productLarge: { width: 800, height: 800, crop: 'fill', quality: 'auto', format: 'auto', gravity: 'auto' },
} as const;

// Upload single product image
export const uploadProductImages = async (
  file: Buffer | string,
  publicId: string,
  originalFilename?: string
): Promise<CloudinaryUploadResult> => {
  try {
    // Save file to a temp path if it's a buffer
    let filePath: string;
    if (Buffer.isBuffer(file)) {
      const tempName = `${publicId || Date.now()}_${originalFilename || 'upload'}`;
      const tempDir = os.tmpdir();
      filePath = path.join(tempDir, tempName);
      await import('fs/promises').then(fs => fs.writeFile(filePath, file));
    } else {
      filePath = file;
    }
    const result = await uploadOnServer(filePath, 'products');
    return result;
  } catch (error) {
    console.error('Local upload error:', error);
    throw new Error(`Failed to upload image: ${error}`);
  }
};

// Batch upload multiple images
export const batchUploadProductImages = async (
  files: Array<{ buffer: Buffer; filename: string; publicId: string }>,
  concurrency: number = 3
): Promise<CloudinaryUploadResult[]> => {
  // Save all buffers to temp files and collect paths
  const tempFiles = await Promise.all(
    files.map(async ({ buffer, filename, publicId }) => {
      const tempName = `${publicId || Date.now()}_${filename}`;
      const tempDir = os.tmpdir();
      const tempPath = path.join(tempDir, tempName);
      await import('fs/promises').then(fs => fs.writeFile(tempPath, buffer));
      return tempPath;
    })
  );
  // Use multiUploadOnServer
  const urls = await multiUploadOnServer(tempFiles, 'products');
  // Return as array of CloudinaryUploadResult
  return (Array.isArray(urls) ? urls : [urls]).map(url => ({ url, path: url }));
};

// Generate responsive image URLs
export const generateResponsiveImageUrl = (
  url: string,
  _options: ImageTransformOptions = {}
): string => {
  // Just return the url as is for local uploads
  return url;
};

// Generate multiple sizes for responsive images
export const generateResponsiveImageSet = (
  url: string,
  sizes: (keyof typeof IMAGE_TRANSFORMATIONS)[] = ['thumbnail', 'small', 'medium', 'large']
): Record<string, string> => {
  // For local uploads, just return the same url for all sizes
  const imageSet: Record<string, string> = {};
  sizes.forEach(size => {
    imageSet[size] = url;
  });
  return imageSet;
};

// Delete image by public ID
export const deleteImage = async (imageUrl: string): Promise<any> => {
  try {
    const result = await deleteImageFromLocalStorage(imageUrl);
    return result;
  } catch (error) {
    console.error('Local delete error:', error);
    throw new Error(`Failed to delete image: ${error}`);
  }
};

// Search images by tag
export const searchImagesByTag = async (_tag: string): Promise<any> => {
  // Not supported for local uploads
  return [];
};

// Get image details
export const getImageDetails = async (_url: string): Promise<any> => {
  // Not supported for local uploads
  return null;
};

// Test Cloudinary connection
export const testCloudinaryConnection = async (_retries: number = 3): Promise<boolean> => {
  // Always true for local uploads
  return true;
};

// Get upload stats
export const getUploadStats = async (): Promise<any> => {
  // Not supported for local uploads
  return null;
};
