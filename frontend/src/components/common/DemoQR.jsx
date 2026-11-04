import { QRCodeSVG } from "qrcode.react";

export const DemoQR = ({ value, size = 200, testid = "demo-qr" }) => (
  <div data-testid={testid} className="relative inline-block rounded-2xl border border-slate-200 bg-white p-4">
    <QRCodeSVG value={value} size={size} level="M" fgColor="#0B1736" />
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <span className="-rotate-12 rounded-md border-2 border-red-600 bg-white/90 px-3 py-1 text-lg font-black tracking-[0.25em] text-red-600 shadow">DEMO</span>
    </div>
  </div>
);
