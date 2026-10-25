# Transformation source attribution

The pinned linkding integration preserves portions of the original Django
settings, URLs and HTML templates while adding a bounded AE integration.
Upstream: <https://github.com/sissbruecker/linkding>, commit
`24b5ad6cc9bde497b5d1b1e86aed5a2fb7d25c2f` (v1.47.0).
Copyright (c) 2019 Sascha Ißbrücker. MIT license; the complete upstream license
is retained at [linkding-LICENSE.txt](test/fixtures/public-env/linkding-LICENSE.txt).
The unchanged public `.env.sample` used by materialization safety tests comes
from the same source and license. The exception permits only its reviewed bytes,
not customer environment or credential files.

The reveal.js and Kanboard recipes target separately licensed host repositories;
AE does not replace their licenses or ownership. Keep each original host's
LICENSE, copyright and bundled dependency notices in its independent adapted
repository. Source pins and hashes constrain reviewed integration scope, not
ownership, affiliation or permission to use private data or credentials.
