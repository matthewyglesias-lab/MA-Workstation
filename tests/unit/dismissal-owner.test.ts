import { describe, it, expect, vi } from 'vitest';
import { createDismissalOwner, type DismissibleLayer } from '../../src/presentation/interaction/dismissal-owner';

const key = (value: string, props = {}) => Object.assign(new Event('keydown', { cancelable: true }), {key:value,...props});
function harness() {
  const target = new EventTarget();
  const add = vi.spyOn(target, 'addEventListener');
  const remove = vi.spyOn(target, 'removeEventListener');
  const modal = vi.fn(() => false);
  const owner = createDismissalOwner(target, modal);
  const layer = (inside = false): DismissibleLayer => ({id:{}, contains:() => inside, dismiss:vi.fn()});
  return {target,add,remove,modal,owner,layer};
}

describe('single non-modal dismissal ownership', () => {
  it('reports a rejected older activation so its caller cannot expose an unowned popup', () => {
    const {owner,layer}=harness(); const newest=layer(), first=layer(), older=layer();
    first.dismiss=() => { owner.activate(newest); };
    expect(owner.activate(first)).toBe(true);
    expect(owner.activate(older)).toBe(false);
    expect(owner.activate(newest)).toBe(true);
    expect(owner.size).toBe(1);
  });
  it('refreshes a retained host without installing another set of listeners', () => {
    const {owner,layer,target,add}=harness(); const first=layer();
    owner.activate(first);
    const refreshed={...first,contains:()=>true}; owner.activate(refreshed);
    target.dispatchEvent(new Event('pointerdown'));
    expect(first.dismiss).not.toHaveBeenCalled(); expect(add).toHaveBeenCalledTimes(3);
  });

  it('installs nothing while closed and exactly one listener per event while open', () => {
    const {owner,layer,add,remove} = harness(); const a=layer();
    expect(add).not.toHaveBeenCalled(); owner.activate(a); owner.activate(a);
    expect(add.mock.calls.map(([type])=>type)).toEqual(['pointerdown','focusin','keydown']);
    owner.deactivate(a.id); expect(remove).toHaveBeenCalledTimes(3); expect(owner.size).toBe(0);
  });
  it('never dismisses twice when pointerdown and focusin arrive in the same task', () => {
    const {owner,layer,target}=harness(); const a=layer(); owner.activate(a);
    target.dispatchEvent(new Event('pointerdown'));target.dispatchEvent(new Event('focusin'));
    expect(a.dismiss).toHaveBeenCalledExactlyOnceWith('outside'); expect(owner.size).toBe(0);
  });
  it('does not dismiss an interaction inside its own surface', () => {
    const {owner,layer,target}=harness();const a=layer(true);owner.activate(a);
    target.dispatchEvent(new Event('pointerdown'));target.dispatchEvent(new Event('focusin'));
    expect(a.dismiss).not.toHaveBeenCalled(); expect(owner.size).toBe(1);
  });
  it('dismisses the old surface before giving ownership to a new one', () => {
    const {owner,layer,target}=harness();const a=layer(),b=layer();owner.activate(a);owner.activate(b);
    expect(a.dismiss).toHaveBeenCalledExactlyOnceWith('superseded');expect(owner.size).toBe(1);
    target.dispatchEvent(key('Escape'));expect(b.dismiss).toHaveBeenCalledExactlyOnceWith('escape');
  });
  it('Escape is consumed before the workstation Back shortcut can run', () => {
    const {owner,layer,target}=harness();const a=layer();owner.activate(a);const event=key('Escape');
    const stop=vi.spyOn(event,'stopPropagation');target.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);expect(stop).toHaveBeenCalledTimes(1);
    expect(a.dismiss).toHaveBeenCalledExactlyOnceWith('escape');
  });
  it('never steals Escape from a native modal', () => {
    const {owner,layer,target,modal}=harness();const a=layer();owner.activate(a);modal.mockReturnValue(true);
    const event=key('Escape');target.dispatchEvent(event);expect(event.defaultPrevented).toBe(false);expect(a.dismiss).not.toHaveBeenCalled();
  });
  it('ignores composing, already-handled and non-Escape keys', () => {
    const {owner,layer,target}=harness();const a=layer();owner.activate(a);
    const handled=key('Escape');handled.preventDefault();
    for(const e of [handled,key('Escape',{isComposing:true}),key('Enter'),key('F9')])target.dispatchEvent(e);
    expect(a.dismiss).not.toHaveBeenCalled();expect(owner.size).toBe(1);
  });
  it('unmount cleanup cannot close a newer surface', () => {
    const {owner,layer}=harness();const a=layer(),b=layer();owner.activate(a);owner.activate(b);owner.deactivate(a.id);
    expect(owner.size).toBe(1);expect(b.dismiss).not.toHaveBeenCalled();owner.deactivate(b.id);expect(owner.size).toBe(0);
  });
  it('the latest re-entrant activation wins rather than installing two owners', () => {
    const {owner,layer,target}=harness();const a=layer(),b=layer(),c=layer();
    a.dismiss=vi.fn(()=>owner.activate(c));owner.activate(a);owner.activate(b);
    expect(owner.size).toBe(1);target.dispatchEvent(key('Escape'));
    expect(c.dismiss).toHaveBeenCalledExactlyOnceWith('escape');expect(b.dismiss).not.toHaveBeenCalled();expect(owner.size).toBe(0);
  });
  it('repeated opens and closes return every listener to its initial count', () => {
    const {owner,layer,add,remove,target}=harness();
    for(let n=0;n<100;n++){owner.activate(layer());target.dispatchEvent(key('Escape'));}
    expect(add).toHaveBeenCalledTimes(300);expect(remove).toHaveBeenCalledTimes(300);expect(owner.size).toBe(0);
  });
});
