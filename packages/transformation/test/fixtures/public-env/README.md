# Reviewed public environment template

`linkding.env.sample.txt` is the unchanged root `.env.sample` from
<https://github.com/sissbruecker/linkding/tree/24b5ad6cc9bde497b5d1b1e86aed5a2fb7d25c2f>.
The upstream MIT license is preserved as `linkding-LICENSE.txt`.

Review: all credential/identity/database credential fields are empty. Non-empty
settings are the public container name, port, local data path and boolean defaults.
The materialization guard permits only these exact bytes at root `.env.sample`
as a regular non-executable committed file. It does not treat arbitrary sample
files as safe or execute environment configuration. Changed templates require
another explicit source review; this fixture is not an editable credential store.
