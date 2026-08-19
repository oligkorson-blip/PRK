"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateAssetImages } from "@/lib/assets/admin-actions";

export function AssetImageForm({
  assetId,
  coverImageUrl,
  galleryImageUrls,
  coverImageCaption
}: {
  assetId: string;
  coverImageUrl: string | null;
  galleryImageUrls: string[];
  coverImageCaption: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const errorRef = useRef<HTMLParagraphElement>(null);
  const messageRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (isPending) return;
    if (error) {
      errorRef.current?.focus();
    } else if (message) {
      messageRef.current?.focus();
    }
  }, [error, isPending, message]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    const fd = new FormData(event.currentTarget);
    startTransition(async () => {
      try {
        const result = await updateAssetImages({
          assetId,
          coverImageUrl: String(fd.get("coverImageUrl") ?? ""),
          galleryImageUrlsText: String(fd.get("galleryImageUrls") ?? ""),
          coverImageCaption: String(fd.get("coverImageCaption") ?? "")
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setMessage("Images saved.");
        router.refresh();
      } catch {
        setError("The images could not be saved. Please try again.");
      }
    });
  }

  return (
    <form className="asset-image-form" onSubmit={handleSubmit} aria-busy={isPending}>
      <fieldset className="form-fieldset" disabled={isPending}>
        <legend className="sr-only">Asset images</legend>
        <label className="form-field">
          <span>Cover image URL</span>
          <input
            name="coverImageUrl"
            type="text"
            defaultValue={coverImageUrl ?? ""}
            placeholder="https://… or /assets/…"
            disabled={isPending}
          />
        </label>
        <label className="form-field">
          <span>Gallery URLs (one per line)</span>
          <textarea
            name="galleryImageUrls"
            rows={3}
            defaultValue={galleryImageUrls.join("\n")}
            placeholder="https://…&#10;https://…"
            disabled={isPending}
          />
        </label>
        <label className="form-field">
          <span>Cover / gallery caption</span>
          <input
            name="coverImageCaption"
            type="text"
            defaultValue={coverImageCaption ?? ""}
            placeholder="e.g. Terminal forecourt"
            disabled={isPending}
          />
        </label>
        {error ? (
          <p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>
            {error}
          </p>
        ) : null}
        {message ? (
          <p
            ref={messageRef}
            className="field-hint"
            role="status"
            aria-live="polite"
            tabIndex={-1}
          >
            {message}
          </p>
        ) : null}
        <button className="btn btn-ghost btn-sm" type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save images"}
        </button>
      </fieldset>
    </form>
  );
}
