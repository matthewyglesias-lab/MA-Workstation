import { IPMG_LOGO } from "./ipmg-logo";

/** Local asset; never requests a logo, font, or identity from a remote service. */
export function IPMGBrand() {
  return (
    <div class="lf-sidebar-brand ipmg-brand">
      <img class="ipmg-brand-logo" src={IPMG_LOGO} width="147" height="52"
        alt="Inland Psychiatric Medical Group" draggable={false} />
      <span class="ipmg-product-name">MA Workstation</span>
    </div>
  );
}
