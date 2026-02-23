import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockDb, TEST_USER_ID, MOCK_ENV_CONFIG, type MockDb } from '../helpers/setup';

const mockS3Send = vi.fn().mockResolvedValue({});

vi.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: class { send = mockS3Send; },
    PutObjectCommand: class { constructor(public input: unknown) {} },
  };
});

vi.mock('../../services/subscriptionService', () => ({
  getUserTier: vi.fn().mockResolvedValue('free'),
}));

let mockDb: MockDb;

beforeEach(() => {
  mockDb = createMockDb();
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'test-uuid-1234') });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('commitService', () => {
  describe('commitImage', () => {
    it('successfully commits image from URL', async () => {
      const imageBuffer = Buffer.from('fake-image-data');
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'image/png' }),
        arrayBuffer: () => Promise.resolve(imageBuffer.buffer),
      }));

      mockDb.limit
        .mockResolvedValueOnce([{ storageLimitBytes: 100 * 1024 * 1024 }])
        .mockResolvedValueOnce([]);
      mockDb.then.mockImplementationOnce(
        (r?: ((v: unknown) => unknown) | null) => Promise.resolve([{ sum: '0' }]).then(r),
      );

      const { commitImage } = await import('../../services/commitService');
      const result = await commitImage(
        TEST_USER_ID,
        'https://example.com/image.png',
        undefined,
        MOCK_ENV_CONFIG as never,
        mockDb as never,
      );

      expect(result.imageUrl).toContain('test-uuid-1234');
      expect(result.imageUrl).toContain(MOCK_ENV_CONFIG.THUMBNAIL_CLOUDFRONT_URL);
    });

    it('falls back to fallbackUrl when primary fetch fails', async () => {
      const imageBuffer = Buffer.from('fallback-image');
      let callCount = 0;
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ ok: false, status: 404, headers: new Headers() });
        }
        return Promise.resolve({
          ok: true,
          headers: new Headers({ 'content-type': 'image/jpeg' }),
          arrayBuffer: () => Promise.resolve(imageBuffer.buffer),
        });
      }));

      mockDb.limit
        .mockResolvedValueOnce([{ storageLimitBytes: 100 * 1024 * 1024 }])
        .mockResolvedValueOnce([]);
      mockDb.then.mockImplementationOnce(
        (r?: ((v: unknown) => unknown) | null) => Promise.resolve([{ sum: '0' }]).then(r),
      );

      const { commitImage } = await import('../../services/commitService');
      const result = await commitImage(
        TEST_USER_ID,
        'https://example.com/broken.png',
        'https://example.com/fallback.jpg',
        MOCK_ENV_CONFIG as never,
        mockDb as never,
      );

      expect(result.imageUrl).toContain('test-uuid-1234');
    });

    it('throws STORAGE_QUOTA_EXCEEDED when quota exceeded', async () => {
      const imageBuffer = Buffer.from('x'.repeat(1000));
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'image/png' }),
        arrayBuffer: () => Promise.resolve(imageBuffer.buffer),
      }));

      mockDb.limit.mockResolvedValueOnce([{ storageLimitBytes: 500 }]);
      mockDb.then.mockImplementationOnce(
        (r?: ((v: unknown) => unknown) | null) => Promise.resolve([{ sum: '400' }]).then(r),
      );

      const { commitImage } = await import('../../services/commitService');

      await expect(
        commitImage(
          TEST_USER_ID,
          'https://example.com/big.png',
          undefined,
          MOCK_ENV_CONFIG as never,
          mockDb as never,
        ),
      ).rejects.toThrow('STORAGE_QUOTA_EXCEEDED');
    });

    it('throws error when image fetch fails with no fallback', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        headers: new Headers(),
      }));

      const { commitImage } = await import('../../services/commitService');

      await expect(
        commitImage(
          TEST_USER_ID,
          'https://example.com/broken.png',
          undefined,
          MOCK_ENV_CONFIG as never,
          mockDb as never,
        ),
      ).rejects.toThrow('Image fetch failed');
    });
  });
});
