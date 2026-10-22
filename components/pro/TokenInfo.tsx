"use client";

import type { ReactNode } from "react";
import { Modal } from "@/components/ui/Modal";
import type { TokenMeta } from "@/hooks/useTokenMeta";
import { TESTNET_EXPLORER } from "@/lib/chains";
import { fmtTokens, fmtUsdc } from "@/lib/launch";
import { V2_SPLIT, V2_VESTING_DAYS, priceUsd, windowLabel, type AuctionV2, type BatchVersion } from "@/lib/launchV2";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="shrink-0 text-[12px] text-muted">{label}</dt>
      <dd className="min-w-0 text-right font-mono text-[12.5px] text-chrome">{children}</dd>
    </div>
  );
}

function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="underline decoration-line-2 underline-offset-2 hover:decoration-chrome">
      {children}
    </a>
  );
}

/** Everything known about a launch, from the chain and the token's own metadata. */
export function TokenInfo({
  open,
  onClose,
  auction,
  meta,
  symbol,
  name,
  version,
  id,
  vestDays,
}: {
  open: boolean;
  onClose: () => void;
  auction: AuctionV2;
  meta: TokenMeta;
  symbol: string;
  name: string | null;
  version: BatchVersion;
  id: string;
  /** From useCreatorVestingDays: 30, 0 for an instant unlock, null while loading. */
  vestDays: number | null;
}) {
  const socials = [
    meta.links.x && { label: "X", href: meta.links.x },
    meta.links.farcaster && { label: "Farcaster", href: meta.links.farcaster },
    meta.links.website && { label: "Website", href: meta.links.website },
  ].filter(Boolean) as { label: string; href: string }[];

  return (
    <Modal open={open} onClose={onClose} title={`${symbol}${name ? ` · ${name}` : ""}`} subtitle={`Crux V${version} launch #${id} on Base Sepolia testnet`}>
      <p className="text-[13.5px] leading-relaxed text-chrome/80">{meta.description ?? "The creator didn't add a description."}</p>
      {socials.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {socials.map((s) => (
            <li key={s.label}>
              <a
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-[4px] border border-line-2 px-2.5 py-1 text-[12px] text-muted transition-colors hover:text-chrome"
              >
                {s.label} ↗
              </a>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-dim">Description and links are the creator&apos;s own words, stored with the token at launch. Not verified by Crux.</p>

      <dl className="mt-4 divide-y divide-line border-y border-line">
        <Row label="Contract">
          <Ext href={`${TESTNET_EXPLORER}/token/${auction.token}`}>{short(auction.token)}</Ext>
        </Row>
        <Row label="Creator">
          <Ext href={`${TESTNET_EXPLORER}/address/${auction.creator}`}>{short(auction.creator)}</Ext>
        </Row>
        {auction.status === 1 && (
          <Row label="Pool (LP burned)">
            <Ext href={`${TESTNET_EXPLORER}/address/${auction.pair}`}>{short(auction.pair)}</Ext>
          </Row>
        )}
        <Row label="Total supply">{fmtTokens(auction.totalSupply)}</Row>
        <Row label="Split">{`${V2_SPLIT.saleBps / 100}% sale · ${V2_SPLIT.lpBps / 100}% pool · ${V2_SPLIT.creatorBps / 100}% creator`}</Row>
        <Row label="Creator vesting">
          {vestDays === 0 ? <span className="text-down">Instant unlock (no vesting)</span> : `${vestDays ?? V2_VESTING_DAYS}-day linear`}
        </Row>
        <Row label="Batch window">{windowLabel(auction.batchWindow)}</Row>
        <Row label="Graduation target">${fmtUsdc(auction.graduationTarget)}</Row>
        <Row label="Floor price">${priceUsd(auction.floorPrice)}</Row>
        {auction.status === 1 && <Row label="Cleared at">${priceUsd(auction.clearingPrice)}</Row>}
        <Row label="Launched">{new Date(auction.startTime * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</Row>
      </dl>
    </Modal>
  );
}
