import { useEffect, useMemo, useState } from 'react';
import {
  getAllStandardPrinters,
  getPrinterByScope,
  setPrinterByScope,
  type PrinterScopeKey,
} from '../lib/printerConfig';

export function usePrinters() {
  const [printers, setPrinters] = useState(() => getAllStandardPrinters());

  useEffect(() => {
    const sync = () => setPrinters(getAllStandardPrinters());

    window.addEventListener('codecpos:printers-updated', sync);
    window.addEventListener('storage', sync);

    return () => {
      window.removeEventListener('codecpos:printers-updated', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const api = useMemo(() => ({
    printers,
    getPrinter: (scope: PrinterScopeKey) => getPrinterByScope(scope),
    setPrinter: (scope: PrinterScopeKey, printerName: string) => {
      setPrinterByScope(scope, printerName);
      setPrinters(getAllStandardPrinters());
    },
  }), [printers]);

  return api;
}
