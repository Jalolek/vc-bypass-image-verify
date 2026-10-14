/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Jalolek and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { classNameFactory } from "@utils/css";
import { openImageModal } from "@utils/discord";
import definePlugin, { OptionType } from "@utils/types";
import type { Message, MessageAttachment } from "@vencord/discord-types";
import { useEffect, useState } from "@webpack/common";

const cl = classNameFactory("vc-biv-");

/** EmbedFlags / AttachmentFlags: CONTAINS_EXPLICIT_MEDIA | CONTAINS_GORE_CONTENT */
const SENSITIVE_FLAGS = (1 << 4) | (1 << 6);

const settings = definePluginSettings({
    autoLoad: {
        type: OptionType.BOOLEAN,
        description: "Load flagged media automatically instead of showing a button",
        default: false,
    },
});

type MediaItem = {
    url: string;
    proxyUrl?: string;
    width?: number;
    height?: number;
    contentType?: string;
    kind: "image" | "video";
};

type AttachmentWithFlags = MessageAttachment & { flags?: number; };

function hasSensitiveFlag(flags: number | undefined | null) {
    return ((flags ?? 0) & SENSITIVE_FLAGS) !== 0;
}

function isSensitiveMessage(message: Message) {
    if (message.embeds?.some(e => hasSensitiveFlag(e.flags))) return true;
    if (message.attachments?.some(a => hasSensitiveFlag((a as AttachmentWithFlags).flags))) return true;
    return false;
}

function pickUrl(primary?: string | null, fallback?: string | null) {
    return primary || fallback || "";
}

function collectMedia(message: Message): MediaItem[] {
    const items: MediaItem[] = [];
    const seen = new Set<string>();

    const add = (item: MediaItem) => {
        if (!item.url || seen.has(item.url)) return;
        seen.add(item.url);
        items.push(item);
    };

    for (const embed of message.embeds ?? []) {
        if (!hasSensitiveFlag(embed.flags)) continue;

        const image = embed.image;
        if (image?.url || image?.proxyURL) {
            add({
                url: pickUrl(image.url, image.proxyURL),
                proxyUrl: image.proxyURL,
                width: image.width,
                height: image.height,
                contentType: image.contentType,
                kind: "image",
            });
        }

        const thumb = embed.thumbnail;
        if (thumb && !image && (thumb.url || thumb.proxyURL)) {
            add({
                url: pickUrl(thumb.url, thumb.proxyURL),
                proxyUrl: thumb.proxyURL,
                width: thumb.width,
                height: thumb.height,
                contentType: thumb.contentType,
                kind: "image",
            });
        }

        const video = embed.video;
        if (video?.url || video?.proxyURL) {
            add({
                url: pickUrl(video.url, video.proxyURL),
                proxyUrl: video.proxyURL,
                width: video.width,
                height: video.height,
                contentType: video.contentType,
                kind: "video",
            });
        }
    }

    for (const att of message.attachments ?? []) {
        if (!hasSensitiveFlag((att as AttachmentWithFlags).flags)) continue;

        const ct = att.content_type ?? "";
        const url = pickUrl(att.url, att.proxy_url);
        if (!url) continue;

        if (ct.startsWith("video/") || /\.(mp4|webm|mov)(\?|$)/i.test(url)) {
            add({
                url,
                proxyUrl: att.proxy_url,
                width: att.width,
                height: att.height,
                contentType: ct,
                kind: "video",
            });
            continue;
        }

        if (
            ct.startsWith("image/")
            || !ct
            || /\.(png|jpe?g|gif|webp|avif|bmp)(\?|$)/i.test(url)
        ) {
            add({
                url,
                proxyUrl: att.proxy_url,
                width: att.width,
                height: att.height,
                contentType: ct,
                kind: "image",
            });
        }
    }

    return items;
}

function MediaView({ item }: { item: MediaItem; }) {
    const [src, setSrc] = useState(item.url);
    const [failed, setFailed] = useState(false);

    if (failed) {
        return <div className={cl("error")}>Failed to load media</div>;
    }

    if (item.kind === "video") {
        const isGifv = /\.mp4(\?|$)/i.test(src) || item.contentType === "video/mp4";
        return (
            <video
                className={cl("video")}
                src={src}
                controls={!isGifv}
                autoPlay={isGifv}
                loop={isGifv}
                muted={isGifv}
                playsInline
                preload="metadata"
                onError={() => {
                    if (item.proxyUrl && src !== item.proxyUrl) {
                        setSrc(item.proxyUrl);
                        return;
                    }
                    setFailed(true);
                }}
            />
        );
    }

    return (
        <img
            className={cl("img")}
            src={src}
            alt=""
            loading="lazy"
            width={item.width}
            height={item.height}
            onClick={() => openImageModal({
                url: src,
                original: item.url,
                width: item.width ?? 800,
                height: item.height ?? 600,
            })}
            onError={() => {
                if (item.proxyUrl && src !== item.proxyUrl) {
                    setSrc(item.proxyUrl);
                    return;
                }
                setFailed(true);
            }}
        />
    );
}

function BypassAccessory({ message }: { message: Message; }) {
    const sensitive = isSensitiveMessage(message);
    const media = collectMedia(message);
    const [loaded, setLoaded] = useState(settings.store.autoLoad);

    useEffect(() => {
        setLoaded(settings.store.autoLoad);
    }, [message.id]);

    if (!sensitive || media.length === 0) return null;

    const loadLabel = media.length === 1
        ? (media[0].kind === "video" ? "Load Video" : "Load Image")
        : "Load Media";

    return (
        <div className={cl("wrap")}>
            {loaded ? (
                <div className={cl("media")}>
                    {media.map(item => (
                        <MediaView key={item.url} item={item} />
                    ))}
                    <div className={cl("actions")}>
                        <Button variant="secondary" size="small" onClick={() => setLoaded(false)}>
                            Hide
                        </Button>
                    </div>
                </div>
            ) : (
                <div className={cl("actions")}>
                    <Button variant="primary" size="small" onClick={() => setLoaded(true)}>
                        {loadLabel}
                    </Button>
                </div>
            )}
        </div>
    );
}

export default definePlugin({
    name: "BypassImageVerify",
    description: "Adds a Load Image button on messages Discord flags as sensitive / blocks behind content filters",
    authors: [{ name: "Jalolek", id: 1156907087431991306n }],
    tags: ["Media", "Utility", "Chat"],
    settings,
    dependencies: ["MessageAccessoriesAPI", "DynamicImageModalAPI"],

    renderMessageAccessory: props => <BypassAccessory message={props.message} />,
});
