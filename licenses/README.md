# Supplemental dependency notices

`saxes-6.0.0-LICENSE.txt` is the unmodified license file from the exact upstream
v6.0.0 tag: https://raw.githubusercontent.com/lddubeau/saxes/v6.0.0/LICENSE.
The npm 6.0.0 package declares ISC but omits this file; retaining the upstream text
also preserves the older sax and String.fromCodePoint attribution included there.

`scripts/release-audit.mjs` generates the full installed dependency notice bundle.
For pg-types and pgpass the distributed README contains the actual MIT text.
Rolldown's native platform bindings share the exact-version rolldown package's
MIT and THIRD-PARTY-LICENSE texts. The MCP packages' full LICENSE files include
both Apache-2.0 and remaining MIT terms, which are retained without flattening.
