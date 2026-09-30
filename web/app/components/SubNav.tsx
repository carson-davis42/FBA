import { useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

export type SubNavItem = { label: string; to: string; end?: boolean } | { label: string; id: string };

/** Sticky section tabs under the site nav: route links, or in-page tabs when items have ids. */
export function SubNav({ label, items, active, onSelect }: { label: string; items: SubNavItem[]; active?: string; onSelect?: (id: string) => void }) {
  return items.length > 0 && 'id' in items[0]
    ? <TabNav label={label} items={items} active={active} onSelect={onSelect} />
    : <RouteNav label={label} items={items} />;
}

function TabNav({ label, items, active, onSelect }: { label: string; items: SubNavItem[]; active?: string; onSelect?: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [active]);
  return (
    <div ref={ref} className="subnav" role="tablist" aria-label={label}>
      {items.map(it => 'id' in it && (
        <button key={it.id} type="button" role="tab" aria-selected={active === it.id} className={active === it.id ? 'active' : ''} onClick={() => onSelect?.(it.id)}>{it.label}</button>
      ))}
    </div>
  );
}

function RouteNav({ label, items }: { label: string; items: SubNavItem[] }) {
  const ref = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('a.active')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [pathname]);
  return (
    <nav ref={ref} className="subnav" aria-label={label}>
      {items.map(it => 'to' in it && <NavLink key={it.to} to={it.to} end={it.end ?? true}>{it.label}</NavLink>)}
    </nav>
  );
}
