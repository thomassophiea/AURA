function Tooltip() {
  return (
    <div className="absolute bg-[#4d4f63] content-stretch flex items-center justify-center left-0 px-[8px] py-[4px] rounded-[4px] shadow-[0px_8px_8px_0px_rgba(30,31,42,0.24),0px_4px_4px_0px_rgba(30,31,42,0.24),0px_2px_2px_0px_rgba(30,31,42,0.24)] top-0" data-name="Tooltip">
      <div className="flex flex-col font-['Source_Sans_Pro:Regular',sans-serif] justify-center leading-[0] not-italic relative shrink-0 text-[#f8f8fb] text-[12px] text-nowrap">
        <p className="leading-[20px] whitespace-pre">Tooltip text</p>
      </div>
    </div>
  );
}

export default function Frame() {
  return (
    <div className="relative size-full">
      <Tooltip />
    </div>
  );
}