import svgPaths from "./svg-jske0bemls";

function SwitchAccount() {
  return (
    <div className="absolute left-0 size-[24px] top-0" data-name="switch-account">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 24 24">
        <g id="switch-account">
          <path d={svgPaths.p1afafa00} fill="var(--fill-0, #BABCCE)" id="Vector" />
        </g>
      </svg>
    </div>
  );
}

export default function Frame() {
  return (
    <div className="relative size-full">
      <SwitchAccount />
    </div>
  );
}