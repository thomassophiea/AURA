/**
 * Drag-and-drop upload for the two brand images (logo, background).
 *
 * Validated twice, deliberately: once here, against the file the browser
 * already has, so a guest^H^H^Hoperator picking an obviously-too-big image
 * finds out before a round trip; and again by the portal itself, which is
 * the only check that actually matters — this modal's numbers are a UX
 * convenience, not the enforcement. Keep `CLIENT_LIMITS` in sync with
 * OS-ONE-CWP's `lib/config/imageUpload.ts` `BRAND_IMAGE_LIMITS`; a mismatch
 * only ever costs an extra round trip, never an incorrectly-accepted file.
 */
import { useCallback, useRef, useState } from 'react';
import { Loader2, UploadCloud } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Button } from '../../ui/button';
import { cn } from '../../ui/utils';
import {
  uploadPortalImage,
  PortalConfigError,
  type BrandImageKind,
} from '../../../services/portalConfigService';

interface ImageLimits {
  maxBytes: number;
  maxWidth?: number;
  maxHeight?: number;
}

const CLIENT_LIMITS: Record<BrandImageKind, ImageLimits> = {
  logo: { maxBytes: 100_000, maxWidth: 500, maxHeight: 200 },
  background: { maxBytes: 5_000_000 },
};

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

function limitMessage(limits: ImageLimits): string {
  const sizeText = `file size must be less than ${Math.round(limits.maxBytes / 1000)}kB`;
  if (limits.maxWidth && limits.maxHeight) {
    return `Invalid image: ${sizeText} and image dimensions must be less than width:${limits.maxWidth}, height:${limits.maxHeight}.`;
  }
  return `Invalid image: ${sizeText}.`;
}

function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('not a readable image'));
    };
    img.src = url;
  });
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('could not read file'));
    reader.readAsDataURL(file);
  });
}

export function UploadImageModal({
  kind,
  open,
  onOpenChange,
  onUploaded,
}: {
  kind: BrandImageKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful upload so the caller can refresh the config. */
  onUploaded: () => void;
}) {
  const label = kind === 'logo' ? 'Logo' : 'Background';
  const limits = CLIENT_LIMITS[kind];
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setFile(null);
    setError(null);
    setDragOver(false);
    setUploading(false);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  const close = useCallback(
    (next: boolean) => {
      if (!next) reset();
      onOpenChange(next);
    },
    [onOpenChange, reset]
  );

  const acceptFile = useCallback(
    async (candidate: File) => {
      setError(null);
      if (!ACCEPTED_TYPES.includes(candidate.type)) {
        setError(`Invalid image: file must be a PNG, JPEG, or WebP.`);
        return;
      }
      if (candidate.size > limits.maxBytes) {
        setError(limitMessage(limits));
        return;
      }
      try {
        const { width, height } = await readImageDimensions(candidate);
        if ((limits.maxWidth && width > limits.maxWidth) || (limits.maxHeight && height > limits.maxHeight)) {
          setError(limitMessage(limits));
          return;
        }
      } catch {
        setError('Invalid image: file is not a readable PNG, JPEG, or WebP.');
        return;
      }
      setFile(candidate);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(candidate);
      });
    },
    [limits]
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLButtonElement>) => {
      e.preventDefault();
      setDragOver(false);
      const dropped = e.dataTransfer.files?.[0];
      if (dropped) void acceptFile(dropped);
    },
    [acceptFile]
  );

  const upload = useCallback(async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const dataUrl = await readAsDataUrl(file);
      await uploadPortalImage(kind, dataUrl, file.type);
      onUploaded();
      close(false);
    } catch (err) {
      setError(
        err instanceof PortalConfigError
          ? (err.details?.[0] ?? err.message)
          : 'Upload failed. Try again.'
      );
      setUploading(false);
    }
  }, [file, kind, onUploaded, close]);

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload {label}</DialogTitle>
          <DialogDescription>
            {kind === 'logo'
              ? `PNG, JPEG, or WebP. Under ${Math.round(limits.maxBytes / 1000)}kB, no larger than ${limits.maxWidth}×${limits.maxHeight}px.`
              : `PNG, JPEG, or WebP. Under ${Math.round(limits.maxBytes / 1_000_000)}MB — no size limit beyond that.`}
          </DialogDescription>
        </DialogHeader>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={cn(
            'flex w-full flex-col items-center gap-3 rounded-lg border-2 border-dashed p-8 text-center transition-colors',
            dragOver ? 'border-primary bg-accent/40' : 'border-border hover:bg-accent/20'
          )}
        >
          {previewUrl ? (
            <img
              src={previewUrl}
              alt={`Selected ${label.toLowerCase()} preview`}
              className={kind === 'logo' ? 'h-16 max-w-full object-contain' : 'h-32 w-full object-cover rounded'}
            />
          ) : (
            <UploadCloud className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
          )}
          <span className="text-sm text-muted-foreground">
            {file
              ? `${file.name} — ${Math.round(file.size / 1000)}kB`
              : `Drag and Drop or Click to Upload ${label} Image`}
          </span>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_TYPES.join(',')}
            className="sr-only"
            onChange={(e) => {
              const picked = e.target.files?.[0];
              if (picked) void acceptFile(picked);
              e.target.value = '';
            }}
          />
        </button>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={uploading}>
            Cancel
          </Button>
          <Button onClick={() => void upload()} disabled={!file || uploading}>
            {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
