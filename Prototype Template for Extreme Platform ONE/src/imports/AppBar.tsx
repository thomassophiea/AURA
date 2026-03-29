import svgPaths from "./svg-x3tr3960qt";

function Background() {
  return <div className="absolute backdrop-blur backdrop-filter bg-[#2d2f3e] inset-0" data-name="Background" />;
}

function Background1() {
  return <div className="absolute h-[52px] left-0 right-0 rounded-[8px] shadow-[0px_16px_16px_0px_rgba(30,31,42,0.24),0px_8px_8px_0px_rgba(30,31,42,0.24),0px_4px_4px_0px_rgba(30,31,42,0.24),0px_2px_2px_0px_rgba(30,31,42,0.24)] top-1/2 translate-y-[-50%]" data-name="Background" />;
}

function Menu() {
  return (
    <div className="relative shrink-0 size-[24px]" data-name="menu">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 24 24">
        <g id="menu">
          <path d={svgPaths.p3f93e280} fill="var(--fill-0, #F8F8FB)" id="Vector" />
        </g>
      </svg>
    </div>
  );
}

function HoverArea() {
  return (
    <div className="basis-0 content-stretch flex gap-[6px] grow items-center justify-center min-h-px min-w-px p-[8px] relative rounded-[4px] shrink-0" data-name="Hover area">
      <Menu />
    </div>
  );
}

function ControlButton() {
  return (
    <div className="content-stretch flex flex-col gap-[8px] h-[52px] items-start p-[6px] relative rounded-[8px] shrink-0" data-name="Control Button">
      <Background1 />
      <HoverArea />
    </div>
  );
}

function Ep1NetworkingNavigationMenu() {
  return (
    <div className="content-stretch flex flex-col items-center justify-center relative rounded-[8px] shrink-0" data-name="EP1 - Networking - Navigation Menu">
      <ControlButton />
    </div>
  );
}

function Bell() {
  return (
    <div className="absolute inset-[18.75%]" data-name="bell">
      <div className="absolute bottom-[-4.95%] left-0 right-[-1.25%] top-0">
        <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 21 21">
          <g id="bell">
            <path d={svgPaths.p25b3aec0} fill="var(--fill-0, #F8F8FB)" id="Vector" />
          </g>
        </svg>
      </div>
    </div>
  );
}

function Avatar() {
  return (
    <div className="bg-[#1e1f2a] relative rounded-[100px] shrink-0 size-[32px]" data-name="Avatar">
      <Bell />
    </div>
  );
}

function HoverArea1() {
  return (
    <div className="content-stretch flex items-center justify-center px-0 py-[8px] relative rounded-[4px] shrink-0 size-[40px]" data-name="Hover area">
      <Avatar />
    </div>
  );
}

function ControlButton2() {
  return (
    <div className="content-stretch flex flex-col gap-[8px] items-center justify-center p-[6px] relative rounded-[8px] shrink-0" data-name="Control Button 1">
      <HoverArea1 />
    </div>
  );
}

function User() {
  return (
    <div className="absolute inset-[18.75%]" data-name="user">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 20 20">
        <g id="user">
          <path d={svgPaths.p274c4000} fill="var(--fill-0, #F8F8FB)" id="Vector" />
        </g>
      </svg>
    </div>
  );
}

function Avatar1() {
  return (
    <div className="bg-[#1e1f2a] relative rounded-[100px] shrink-0 size-[32px]" data-name="Avatar">
      <User />
    </div>
  );
}

function HoverArea2() {
  return (
    <div className="content-stretch flex items-center justify-center p-[4px] relative rounded-[4px] shrink-0 size-[40px]" data-name="Hover area">
      <Avatar1 />
    </div>
  );
}

function ControlButton1() {
  return (
    <div className="content-stretch flex flex-col gap-[8px] items-start p-[6px] relative rounded-[8px] shrink-0" data-name="Control Button 2">
      <HoverArea2 />
    </div>
  );
}

function ControlButtonGroup() {
  return (
    <div className="content-stretch flex items-start relative rounded-[8px] shrink-0" data-name="Control Button Group">
      <ControlButton2 />
      <ControlButton1 />
    </div>
  );
}

function ControlButtonGroup1() {
  return (
    <div className="content-stretch flex items-center relative shrink-0" data-name="Control Button Group">
      <ControlButtonGroup />
    </div>
  );
}

function RightButtons() {
  return (
    <div className="basis-0 content-stretch flex grow h-[52px] items-center justify-end min-h-px min-w-px relative shrink-0" data-name="Right Buttons">
      <ControlButtonGroup1 />
    </div>
  );
}

export default function AppBar() {
  return (
    <div className="relative rounded-[8px] shadow-[0px_16px_16px_0px_rgba(30,31,42,0.24),0px_8px_8px_0px_rgba(30,31,42,0.24),0px_4px_4px_0px_rgba(30,31,42,0.24),0px_2px_2px_0px_rgba(30,31,42,0.24)] size-full" data-name="App Bar">
      <div className="flex flex-row items-center max-w-[inherit] min-h-[inherit] min-w-[inherit] size-full">
        <div className="content-stretch flex gap-[8px] items-center max-w-[inherit] min-h-[inherit] min-w-[inherit] px-[8px] py-[16px] relative size-full">
          <Background />
          <Ep1NetworkingNavigationMenu />
          <p className="basis-0 font-['Source_Sans_Pro:Regular',sans-serif] grow h-[28px] leading-[28px] min-h-px min-w-px not-italic relative shrink-0 text-[#f8f8fb] text-[18px]">Title</p>
          <RightButtons />
        </div>
      </div>
    </div>
  );
}