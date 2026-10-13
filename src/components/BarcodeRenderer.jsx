import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

export default function BarcodeRenderer({ 
  value, 
  width = 1.8, 
  height = 50, 
  fontSize = 13,
  displayValue = true 
}) {
  const svgRef = useRef(null);

  useEffect(() => {
    if (svgRef.current && value) {
      try {
        JsBarcode(svgRef.current, value.trim(), {
          format: 'CODE128',
          lineColor: '#000000',
          width: width,
          height: height,
          displayValue: displayValue,
          text: value.trim(),
          font: 'monospace',
          fontSize: fontSize,
          fontOptions: 'bold',
          textPosition: 'bottom',
          textMargin: 4,
          margin: 6,
          background: '#ffffff',
        });
      } catch (err) {
        console.error('JsBarcode rendering error:', err);
      }
    }
  }, [value, width, height, fontSize, displayValue]);

  if (!value) return null;

  return (
    <div style={{ background: '#ffffff', padding: '2px 0', borderRadius: 0, display: 'flex', justifyContent: 'center', boxSizing: 'border-box' }}>
      <svg ref={svgRef} style={{ maxWidth: '100%', height: 'auto', display: 'block', shapeRendering: 'crispEdges' }} />
    </div>
  );
}
