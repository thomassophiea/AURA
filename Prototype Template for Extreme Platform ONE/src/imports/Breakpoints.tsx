function Key() {
  return (
    <div className="bg-[#f4f4f4] relative rounded-[8px] shrink-0 w-full" data-name="Key">
      <div className="overflow-clip rounded-[inherit] size-full">
        <div className="content-stretch flex gap-[16px] items-start leading-[normal] px-[32px] py-[24px] relative text-[28px] text-black text-nowrap w-full whitespace-pre">
          <p className="font-['Roboto_Mono:Regular',sans-serif] font-normal relative shrink-0">Breakpoint:</p>
          <p className="font-['Roboto_Mono:Bold',sans-serif] font-bold relative shrink-0">{`XS <> S`}</p>
        </div>
      </div>
    </div>
  );
}

function Xs320479Px() {
  return (
    <div className="bg-white h-[568px] overflow-clip relative shrink-0 w-[479px]" data-name="XS (320-479px)">
      <p className="absolute font-['Roboto_Mono:Regular',sans-serif] font-normal leading-[normal] left-1/2 opacity-40 text-[28px] text-black text-center text-nowrap top-[calc(50%-18px)] translate-x-[-50%] whitespace-pre">479px</p>
    </div>
  );
}

function Breakpoint() {
  return (
    <div className="content-stretch flex flex-col gap-[40px] items-center relative self-stretch shrink-0" data-name="Breakpoint">
      <div className="basis-0 grow min-h-px min-w-px relative shrink-0 w-0" data-name="Line">
        <div className="absolute bottom-0 left-[-1px] right-[-1px] top-0">
          <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 2 226">
            <path d="M1 1.96168e-07L1.00004 225.5" id="Line" stroke="var(--stroke-0, black)" strokeWidth="2" />
          </svg>
        </div>
      </div>
      <p className="font-['Roboto_Mono:Bold',sans-serif] font-bold leading-[normal] relative shrink-0 text-[28px] text-black text-center text-nowrap whitespace-pre">Break @ 479px</p>
      <div className="basis-0 grow min-h-px min-w-px relative shrink-0 w-0" data-name="Line">
        <div className="absolute bottom-0 left-[-1px] right-[-1px] top-0">
          <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 2 226">
            <path d="M1 1.96168e-07L1.00004 225.5" id="Line" stroke="var(--stroke-0, black)" strokeWidth="2" />
          </svg>
        </div>
      </div>
    </div>
  );
}

function S480743Px() {
  return (
    <div className="bg-white h-[568px] overflow-clip relative shrink-0 w-[480px]" data-name="S (480-743px)">
      <p className="absolute font-['Roboto_Mono:Regular',sans-serif] font-normal leading-[normal] left-[calc(50%+0.5px)] opacity-40 text-[28px] text-black text-center text-nowrap top-[calc(50%-18px)] translate-x-[-50%] whitespace-pre">480px</p>
    </div>
  );
}

function Chart() {
  return (
    <div className="content-stretch flex gap-[150px] items-start relative shrink-0" data-name="Chart">
      <Xs320479Px />
      <Breakpoint />
      <S480743Px />
    </div>
  );
}

function XsS() {
  return (
    <div className="content-stretch flex flex-col gap-[60px] items-start relative shrink-0" data-name="XS <> S">
      <Key />
      <Chart />
    </div>
  );
}

function Key1() {
  return (
    <div className="bg-[#f4f4f4] relative rounded-[8px] shrink-0 w-full" data-name="Key">
      <div className="overflow-clip rounded-[inherit] size-full">
        <div className="content-stretch flex gap-[16px] items-start leading-[normal] px-[32px] py-[24px] relative text-[28px] text-black text-nowrap w-full whitespace-pre">
          <p className="font-['Roboto_Mono:Regular',sans-serif] font-normal relative shrink-0">Breakpoint:</p>
          <p className="font-['Roboto_Mono:Bold',sans-serif] font-bold relative shrink-0">{`S <> M`}</p>
        </div>
      </div>
    </div>
  );
}

function S480743Px1() {
  return (
    <div className="bg-white overflow-clip relative self-stretch shrink-0 w-[743px]" data-name="S (480-743px)">
      <p className="absolute font-['Roboto_Mono:Regular',sans-serif] font-normal leading-[normal] left-1/2 opacity-40 text-[28px] text-black text-center text-nowrap top-[calc(50%-18px)] translate-x-[-50%] whitespace-pre">743px</p>
    </div>
  );
}

function Breakpoint1() {
  return (
    <div className="content-stretch flex flex-col gap-[40px] items-center relative self-stretch shrink-0" data-name="Breakpoint">
      <div className="basis-0 grow min-h-px min-w-px relative shrink-0 w-0" data-name="Line">
        <div className="absolute bottom-0 left-[-1px] right-[-1px] top-0">
          <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 2 482">
            <path d="M1 9.18711e-08L1.00004 481.5" id="Line" stroke="var(--stroke-0, black)" strokeWidth="2" />
          </svg>
        </div>
      </div>
      <p className="font-['Roboto_Mono:Bold',sans-serif] font-bold leading-[normal] relative shrink-0 text-[28px] text-black text-center text-nowrap whitespace-pre">Break @ 743px</p>
      <div className="basis-0 grow min-h-px min-w-px relative shrink-0 w-0" data-name="Line">
        <div className="absolute bottom-0 left-[-1px] right-[-1px] top-0">
          <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 2 482">
            <path d="M1 9.18711e-08L1.00004 481.5" id="Line" stroke="var(--stroke-0, black)" strokeWidth="2" />
          </svg>
        </div>
      </div>
    </div>
  );
}

function M7441023Px() {
  return (
    <div className="bg-white overflow-clip relative self-stretch shrink-0 w-[744px]" data-name="M (744-1023px)">
      <p className="absolute font-['Roboto_Mono:Regular',sans-serif] font-normal leading-[normal] left-[calc(50%+0.5px)] opacity-40 text-[28px] text-black text-center text-nowrap top-[calc(50%-18px)] translate-x-[-50%] whitespace-pre">744px</p>
    </div>
  );
}

function Chart1() {
  return (
    <div className="content-stretch flex gap-[150px] items-start relative shrink-0" data-name="Chart">
      <S480743Px1 />
      <Breakpoint1 />
      <M7441023Px />
    </div>
  );
}

function SM() {
  return (
    <div className="content-stretch flex flex-col gap-[60px] items-start relative shrink-0" data-name="S <> M">
      <Key1 />
      <Chart1 />
    </div>
  );
}

function Key2() {
  return (
    <div className="bg-[#f4f4f4] relative rounded-[8px] shrink-0 w-full" data-name="Key">
      <div className="overflow-clip rounded-[inherit] size-full">
        <div className="content-stretch flex gap-[16px] items-start leading-[normal] px-[32px] py-[24px] relative text-[28px] text-black text-nowrap w-full whitespace-pre">
          <p className="font-['Roboto_Mono:Regular',sans-serif] font-normal relative shrink-0">Breakpoint:</p>
          <p className="font-['Roboto_Mono:Bold',sans-serif] font-bold relative shrink-0">{`M <> L`}</p>
        </div>
      </div>
    </div>
  );
}

function M7441023Px1() {
  return (
    <div className="bg-white overflow-clip relative self-stretch shrink-0 w-[1023px]" data-name="M (744-1023px)">
      <p className="absolute font-['Roboto_Mono:Regular',sans-serif] font-normal leading-[normal] left-1/2 opacity-40 text-[28px] text-black text-center text-nowrap top-[calc(50%-18px)] translate-x-[-50%] whitespace-pre">1023px</p>
    </div>
  );
}

function Breakpoint2() {
  return (
    <div className="content-stretch flex flex-col gap-[40px] items-center relative self-stretch shrink-0" data-name="Breakpoint">
      <div className="basis-0 grow min-h-px min-w-px relative shrink-0 w-0" data-name="Line">
        <div className="absolute bottom-0 left-[-1px] right-[-1px] top-0">
          <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 2 482">
            <path d="M1 9.18711e-08L1.00004 481.5" id="Line" stroke="var(--stroke-0, black)" strokeWidth="2" />
          </svg>
        </div>
      </div>
      <p className="font-['Roboto_Mono:Bold',sans-serif] font-bold leading-[normal] relative shrink-0 text-[28px] text-black text-center text-nowrap whitespace-pre">Break @ 1023px</p>
      <div className="basis-0 grow min-h-px min-w-px relative shrink-0 w-0" data-name="Line">
        <div className="absolute bottom-0 left-[-1px] right-[-1px] top-0">
          <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 2 482">
            <path d="M1 9.18711e-08L1.00004 481.5" id="Line" stroke="var(--stroke-0, black)" strokeWidth="2" />
          </svg>
        </div>
      </div>
    </div>
  );
}

function L10241365Px() {
  return (
    <div className="bg-white overflow-clip relative self-stretch shrink-0 w-[1024px]" data-name="L (1024-1365px)">
      <p className="absolute font-['Roboto_Mono:Regular',sans-serif] font-normal leading-[normal] left-[calc(50%+0.5px)] opacity-40 text-[28px] text-black text-center text-nowrap top-[calc(50%-18px)] translate-x-[-50%] whitespace-pre">1024px</p>
    </div>
  );
}

function Chart2() {
  return (
    <div className="content-stretch flex gap-[150px] items-start relative shrink-0" data-name="Chart">
      <M7441023Px1 />
      <Breakpoint2 />
      <L10241365Px />
    </div>
  );
}

function ML() {
  return (
    <div className="content-stretch flex flex-col gap-[60px] items-start relative shrink-0" data-name="M <> L">
      <Key2 />
      <Chart2 />
    </div>
  );
}

function Key3() {
  return (
    <div className="bg-[#f4f4f4] relative rounded-[8px] shrink-0 w-full" data-name="Key">
      <div className="overflow-clip rounded-[inherit] size-full">
        <div className="content-stretch flex gap-[16px] items-start leading-[normal] px-[32px] py-[24px] relative text-[28px] text-black text-nowrap w-full whitespace-pre">
          <p className="font-['Roboto_Mono:Regular',sans-serif] font-normal relative shrink-0">Breakpoint:</p>
          <p className="font-['Roboto_Mono:Bold',sans-serif] font-bold relative shrink-0">{`L <> XL`}</p>
        </div>
      </div>
    </div>
  );
}

function L10241365Px1() {
  return (
    <div className="bg-white overflow-clip relative self-stretch shrink-0 w-[1365px]" data-name="L (1024-1365px)">
      <p className="absolute font-['Roboto_Mono:Regular',sans-serif] font-normal leading-[normal] left-1/2 opacity-40 text-[28px] text-black text-center text-nowrap top-[calc(50%-18px)] translate-x-[-50%] whitespace-pre">1365px</p>
    </div>
  );
}

function Breakpoint3() {
  return (
    <div className="content-stretch flex flex-col gap-[40px] items-center relative self-stretch shrink-0" data-name="Breakpoint">
      <div className="basis-0 grow min-h-px min-w-px relative shrink-0 w-0" data-name="Line">
        <div className="absolute bottom-0 left-[-1px] right-[-1px] top-0">
          <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 2 482">
            <path d="M1 9.18711e-08L1.00004 481.5" id="Line" stroke="var(--stroke-0, black)" strokeWidth="2" />
          </svg>
        </div>
      </div>
      <p className="font-['Roboto_Mono:Bold',sans-serif] font-bold leading-[normal] relative shrink-0 text-[28px] text-black text-center text-nowrap whitespace-pre">Break @ 1365px</p>
      <div className="basis-0 grow min-h-px min-w-px relative shrink-0 w-0" data-name="Line">
        <div className="absolute bottom-0 left-[-1px] right-[-1px] top-0">
          <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 2 482">
            <path d="M1 9.18711e-08L1.00004 481.5" id="Line" stroke="var(--stroke-0, black)" strokeWidth="2" />
          </svg>
        </div>
      </div>
    </div>
  );
}

function Xl1366Px() {
  return (
    <div className="bg-white overflow-clip relative self-stretch shrink-0 w-[1366px]" data-name="XL (1366+px)">
      <p className="absolute font-['Roboto_Mono:Regular',sans-serif] font-normal leading-[normal] left-[calc(50%+0.5px)] opacity-40 text-[28px] text-black text-center text-nowrap top-[calc(50%-18px)] translate-x-[-50%] whitespace-pre">1366px</p>
    </div>
  );
}

function Chart3() {
  return (
    <div className="content-stretch flex gap-[150px] items-start relative shrink-0" data-name="Chart">
      <L10241365Px1 />
      <Breakpoint3 />
      <Xl1366Px />
    </div>
  );
}

function LXl() {
  return (
    <div className="content-stretch flex flex-col gap-[60px] items-start relative shrink-0" data-name="L <> XL">
      <Key3 />
      <Chart3 />
    </div>
  );
}

export default function Breakpoints() {
  return (
    <div className="bg-[#f8f8fb] relative size-full" data-name="Breakpoints">
      <div className="size-full">
        <div className="content-stretch flex flex-col gap-[200px] items-start p-[200px] relative size-full">
          <p className="font-['Source_Sans_Pro:SemiBold',sans-serif] leading-[normal] not-italic relative shrink-0 text-[48px] text-black text-nowrap whitespace-pre">Breakpoints</p>
          <XsS />
          <SM />
          <ML />
          <LXl />
        </div>
      </div>
    </div>
  );
}