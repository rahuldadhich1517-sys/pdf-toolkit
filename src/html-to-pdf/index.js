import { PdfToolkitError, ERROR_CODES } from '../shared/errors.js';

/**
 * Normalizes options for HTML print document preparation.
 * @param {object} [customOptions]
 */
export function getHtmlPrintOptions(customOptions = {}) {
  return {
    pageSize: customOptions.pageSize || 'A4',
    orientation: customOptions.orientation || 'portrait',
    margins: customOptions.margins || '15mm',
    title: customOptions.title || 'Print Document',
    customCss: customOptions.customCss || '',
    printBackgrounds: customOptions.printBackgrounds ?? true
  };
}

/**
 * Sanitizes HTML to prevent script execution, external script loads, and event handlers.
 * @param {string} html
 * @returns {string} Sanitized HTML
 */
export function sanitizeHtmlForPrint(html) {
  if (typeof html !== 'string') {
    throw new PdfToolkitError(ERROR_CODES.INVALID_INPUT, 'HTML input must be a string');
  }

  return html
    // Remove script tags and contents
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    // Remove iframe tags
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    // Remove object / embed tags
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '')
    // Remove inline event handlers (onclick, onload, onerror, etc.)
    .replace(/\s+on[a-z0-9_-]+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, '')
    // Prevent javascript: href/src pseudo-protocols
    .replace(/(href|src)\s*=\s*["']?\s*javascript:[^"'>]*/gi, '$1="#"');
}

/**
 * Prepares complete, isolated HTML document formatted for browser print / Save as PDF.
 * Injects required print CSS, page-break controls, and typography.
 *
 * @param {string} html Raw HTML fragment or body
 * @param {object} [options]
 * @returns {string} Fully prepared HTML document string
 */
export function prepareHtmlForPrint(html, options = {}) {
  const opts = getHtmlPrintOptions(options);
  const cleanBody = sanitizeHtmlForPrint(html);

  const printCss = `
    @page {
      size: ${opts.pageSize} ${opts.orientation};
      margin: ${opts.margins};
    }
    @media print {
      body {
        margin: 0;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .page-break {
        page-break-after: always;
        break-after: page;
      }
      .no-print {
        display: none !important;
      }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #111;
      line-height: 1.5;
    }
    ${opts.customCss}
  `;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(opts.title)}</title>
  <style>${printCss}</style>
</head>
<body>
  ${cleanBody}
</body>
</html>`;
}

/**
 * Opens browser print dialog using an isolated iframe context.
 *
 * NOTE ON BROWSER LIMITATION:
 * JavaScript running in the browser cannot silently acquire PDF binary bytes from window.print().
 * This method creates an isolated iframe, loads sanitized HTML, and triggers window.print() so the
 * user can select "Save as PDF".
 *
 * @param {string} html HTML content
 * @param {object} [options]
 * @returns {Promise<{ printed: boolean, message: string }>}
 */
export async function openHtmlPrintDialog(html, options = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new PdfToolkitError(
      ERROR_CODES.UNSUPPORTED_OPERATION,
      'openHtmlPrintDialog requires a browser DOM environment'
    );
  }

  const preparedHtml = prepareHtmlForPrint(html, options);

  return new Promise((resolve, reject) => {
    try {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = 'none';

      document.body.appendChild(iframe);

      const frameDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!frameDoc) {
        document.body.removeChild(iframe);
        throw new PdfToolkitError(ERROR_CODES.UNSUPPORTED_OPERATION, 'Unable to access iframe document');
      }

      frameDoc.open();
      frameDoc.write(preparedHtml);
      frameDoc.close();

      iframe.onload = () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          // Cleanup iframe after a short delay
          setTimeout(() => {
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
          }, 1000);

          resolve({
            printed: true,
            message: 'Print dialog opened. Select "Save as PDF" in the browser print menu.'
          });
        } catch (err) {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
          reject(err);
        }
      };
    } catch (err) {
      reject(new PdfToolkitError(ERROR_CODES.UNSUPPORTED_OPERATION, `Failed to open print dialog: ${err.message}`));
    }
  });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
