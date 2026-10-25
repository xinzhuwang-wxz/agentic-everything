import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { captureBaseline, verifyArchive } from '@ae/verification';
import type { BaselineArchive, Observation, ProjectAssessment, Provenance } from '@ae/contracts';
import { linkdingRecipe, LINKDING_FILES } from './recipes/linkding.js';
import { aeRoot, hash, treeHash } from './inventory-baseline.js';
import { assertFixtureBrowser, fixtureBrowserPath } from './fixture-harness.js';

export const linkdingProfile = 'linkding-upstream-v1' as const;
export const linkdingCommit = '24b5ad6cc9bde497b5d1b1e86aed5a2fb7d25c2f';
export const linkdingHashes: Readonly<Record<string,string>> = Object.freeze({
  ".coveragerc": "8a0da2830570704bcd99d6226918578ab548a28033d4790d971ee60c8b9ad945",
  ".devcontainer/devcontainer.json": "edb01dc6cc9c33375e25e6c35222ac4be96663f1a0e9affb489dc977f390f187",
  ".dockerignore": "1034f2562656461bde19d37eb43a180ec020e9a512d722d5884d8bbee50686a5",
  ".env.sample": "12a0e13fc1b005ea484b96c666813d1a601de5ad85c9db82262b67950dcb10bf",
  ".gitattributes": "2efd923355a7ddf0ac8a901a2ca42f9b80729161fe95fac4305e1700f0398646",
  ".github/dependabot.yml": "d56ede72a3156b5feb6d2da6ff3bbab390ed440a8d1d56b52b7fed6f7327fcf3",
  ".github/workflows/build-test.yaml": "25d9de3b6b5a52956cb25065a6ad9cfef64f6721385b35440433d05befd0d0ef",
  ".github/workflows/build.yaml": "8812061b1dd7b99a0987334fc25c41ed01eac87aacd93eb557393659cfc0c955",
  ".github/workflows/main.yaml": "e49ae6be7991ab72e2d5457be848dbe6643bc3ca816ef042f2374b825afa8719",
  ".gitignore": "fe0b3a576ecc19d2ecf2edf5dace70aefa18367ab1eca15d129a7182e6fe61c4",
  "CHANGELOG.md": "8d5d3bf9255548da8e10f2498e0029a832622ff3a7a767710848463db047428d",
  "LICENSE.txt": "96dfab90f973f8f6faaf7f98e51178bd1acb188b8f80a3060a7c60e483a20699",
  "Makefile": "5975fcb4b32da5d01910f623920656b120b308d9179b838b3cfcc6511a601237",
  "README.md": "ee0d7ad2b5508071b9f36cde500286a90dee41f3251197ff6c81dcfd499c3e8c",
  "SECURITY.md": "441eb3598acbca1fe955233fd9da7ee86ea76b46948221684a3bef749500b20f",
  "assets/header.afdesign": "815861e915786377c366a53fb199cdf458e3f77c7a9f3b35f536800ad483ef8d",
  "assets/header.png": "dcf8b4bead5bec29a909df0e058bea01d9b50fcd71e5b53ac50d3817b8a8b7ab",
  "assets/header.svg": "9cfb54760d75363701d5249cdde765268888a3bdd26a4e5be506db08a97eeac3",
  "assets/logo-inset.afdesign": "da9f00f3cbfc69508a722c871d1d347bfb1a3fe292488808e3269b507a9c1d9e",
  "assets/logo.afdesign": "603c0afccadc61f5c06a1c34ea16737f0dd8c24cbe70917b291b8baa1ce458ed",
  "assets/logo.png": "f5fc05d7dd77321f7bdf8a83cbb057019bd010e70b52bbe68ccb9f7c07075e4c",
  "assets/logo.svg": "63a9cdb3b32edd87e04b2223f8d9c87f23fbae7e4d8f0c95ced1451bd9d59824",
  "assets/social-preview.afdesign": "5211a3716d23ea339ae1818c7bcdc021b28f045196fbfce52b632b415c74d6d1",
  "assets/social-preview.png": "b5e9aa0735f8fa68dd3c5bc122b4429c7bf2cc502705b0928e0df16df7fd5827",
  "bookmarks/__init__.py": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "bookmarks/admin.py": "e37fe3d2e6ca1e7ee26a2ab0f5fe636455f2eb9b31825e916b4797e181a52086",
  "bookmarks/api/__init__.py": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "bookmarks/api/auth.py": "b31d8bad45c7af65f8fb9faf0a817e0d32bf3dec5f3b89d305669cdfc74270f4",
  "bookmarks/api/routes.py": "a7dad564ada04a369e68074e83fceaf0608dd9959814090076be657e1b38346b",
  "bookmarks/api/serializers.py": "b057d24abc373976eac55d4e11a566f52514c5bc099c6462082bacfd5aabc573",
  "bookmarks/apps.py": "77ca49520faf74111022036adc0f7d8fbae822d9c8905d3c708e500496a556e4",
  "bookmarks/context_processors.py": "d9cf4d54171dbd04a8679d96ad05d46a4d01d0c59f99c560a8ced72e175a8576",
  "bookmarks/feeds.py": "e36566051df174f3bd6523dcf0c3a59cec58b1487060f121f3f5fb66f0a5ba1d",
  "bookmarks/forms.py": "2d8994d97c2acdfa9461594ad9fa7f3624a1ea83205da1d3a59421fc9a791827",
  "bookmarks/frontend/api.js": "0a2cf0fee4ac97c7f44adfa95f7c7b92af149c4af3052be4534ad5bdd9d81a7d",
  "bookmarks/frontend/components/bookmark-page.js": "b6caa24221c609442624b48efdb3456c6e637c8f6bd6fa448a394d802debe6e7",
  "bookmarks/frontend/components/clear-button.js": "5a4be1133a01dcdb4cb20e057c782605d5c2ffbf9bf4a9715c1c1bfcc81e2468",
  "bookmarks/frontend/components/confirm-dropdown.js": "1b30a3d7f55c51d81db65d827afc3afedd5eeeb448b8274de4e1495b92dac62b",
  "bookmarks/frontend/components/details-modal.js": "3805354dcc3f401c5132665eacb946ece5e7269686a3d593286b4b516dc4bc2d",
  "bookmarks/frontend/components/dev-tool.js": "40e67943d1fa058dd0e9d8387231abcc5f9cb670f3fc16eba06834a796b19c2c",
  "bookmarks/frontend/components/dropdown.js": "5cca040894c570d660912852e891ec68feb0fafe55de8db038d749860ffe6965",
  "bookmarks/frontend/components/filter-drawer.js": "af3413ea8b5225302aea2a6810eaee71292c8b302be36655751d2f701554301e",
  "bookmarks/frontend/components/form.js": "e95b6d04b41a3e3c358095feca57b7e0302c805d62d7f3439488a9e03485e9cc",
  "bookmarks/frontend/components/modal.js": "9dcba0e7f3c07198da988520b0687a944757a862fefc21466187421ff73fe6ad",
  "bookmarks/frontend/components/search-autocomplete.js": "d4ab7d8e712e3b889a96ebfa034f958b18fe09f6c1559d72042fcda98994c694",
  "bookmarks/frontend/components/tag-autocomplete.js": "afa352faf9f397f5682b4dd2f31c6b0196e3341270993871908a2457de56ac0a",
  "bookmarks/frontend/components/upload-button.js": "bbfeed7134a9e0029c1d1c2da20da26e85fe9d0b723362a07581f151239c054b",
  "bookmarks/frontend/dev.js": "83cae5c34f2ae1c23594e230cf9f84df173fceea218e5723e1fa7920b72e8d8f",
  "bookmarks/frontend/index.js": "2bd27894be80ab364604078f1aed282efc001da58decd9dc536436b9d5b5ee3a",
  "bookmarks/frontend/shortcuts.js": "ce12f7f8769cc85f2ed6a565e9f993bcba87bee909920e4140a7cd6c56f31b0e",
  "bookmarks/frontend/utils/element.js": "4531834eeff2ba82ce175f1eb8584de95f92431e5bfc7d97c1e9d0eb90513abe",
  "bookmarks/frontend/utils/focus.js": "333c92bdb33a3db00dff9842f7197c00f2a41e320e820854d3a95e4cd91357f9",
  "bookmarks/frontend/utils/input.js": "0dc1904f30dd5cd9fd7b1559a26e747d3eeb0a1901892fa167944332107ff755",
  "bookmarks/frontend/utils/position-controller.js": "221736eeb8bfdb31e3f484da72b10164535b0676c8cbdaf12071a5139e5001f9",
  "bookmarks/frontend/utils/search-history.js": "3890980cb5bdb0da9233a9ea5cf02e5581f6c6e37bcaa715e7287f43b3b60c98",
  "bookmarks/frontend/utils/tag-cache.js": "432a2eb23f197a6e1b519cce66bfc6bad1f7184c5cecb3ab0068e618968d2d31",
  "bookmarks/management/commands/backup.py": "e8764a4051ffe47293a50fd3f1777f71663d067052143f5af5b8bcafd3d8c8c5",
  "bookmarks/management/commands/create_initial_superuser.py": "88dc4338c02606b2249e1586ba1bbb2e58c3b90ea52c5f5514de9c5cdf179d70",
  "bookmarks/management/commands/enable_wal.py": "c743d237f230d8e9fbab7e906d96a165d8d93262c505859b46e8b886596fb2a6",
  "bookmarks/management/commands/ensure_superuser.py": "3ad74550da36b3a6d474f8e7392bfe577499a1cee471dd2829260d1d2ebd4e70",
  "bookmarks/management/commands/full_backup.py": "f07221a8b5d34a71bcf8fd28e9126aeb2e127c6b1a21896c5f3d91221cb2125f",
  "bookmarks/management/commands/generate_secret_key.py": "b23d2a6f4c830cbb398bef73c25b7c4124a749b124127f833b1b7743258a2224",
  "bookmarks/management/commands/import_netscape.py": "c16ef7ef3f34619f7b8416a790af2d831016537091d73adba05bd748f8f213f5",
  "bookmarks/management/commands/migrate_tasks.py": "eff8d5c3184f521563413fc88239455b26a12626ce63a051977afd0618342e62",
  "bookmarks/middlewares.py": "43e822a233f6894747b28ffb6573072b7d9bb72e4c79a353010684374639abf9",
  "bookmarks/migrations/0001_initial.py": "172c2554f9d05e882b7cef431a307aceeb271781ed86e0601b22b99c0b513809",
  "bookmarks/migrations/0002_auto_20190629_2303.py": "e4fafe11c385fbaa6c8bb7fee8933bac214dae56d86cfa7f84e29b83f4fb5ae0",
  "bookmarks/migrations/0003_auto_20200913_0656.py": "a0914e9750afd58c9e60e20a0bcbae6ea2e470a3e6c1a6856f7b3ff296f4e464",
  "bookmarks/migrations/0004_auto_20200926_1028.py": "6eccbb5bdf1617b920bc4d3baa3728dc4813fbaf5b755fa5bf4bbfa42ba7344a",
  "bookmarks/migrations/0005_auto_20210103_1212.py": "c005ced4ff6ff01e44e20158105b710fa0925820e886714e6f8b249186c32576",
  "bookmarks/migrations/0006_bookmark_is_archived.py": "d856de82904e9d8f58592a34f0ef7e56fb5260d1c98d7385c352279c2be99e12",
  "bookmarks/migrations/0007_userprofile.py": "57153c65bf638f4c1f46b7316e43bb5d69c9ea575855213f9df483da972a7d97",
  "bookmarks/migrations/0008_userprofile_bookmark_date_display.py": "af785d94847365dc8d042509fda85107a555d163aadf1f4647645c5171b9f22b",
  "bookmarks/migrations/0009_bookmark_web_archive_snapshot_url.py": "5c4a579cc7f73b1e1a484dcb14392847a0a7b059e1dba1ba84458ddcfc060cbe",
  "bookmarks/migrations/0010_userprofile_bookmark_link_target.py": "5c2ed57fa812d5c69e2561875d07069d7085d63db658d41da0ad19afa7cf4e14",
  "bookmarks/migrations/0011_userprofile_web_archive_integration.py": "0022fd866894d5745c8cf8a27e785faa9377c0843a465d897802e443d50490a4",
  "bookmarks/migrations/0012_toast.py": "5f47d5c487f2f1e4faf9d777f9ad6850bdf05d81e15c5a0ca80b91a28b5556cc",
  "bookmarks/migrations/0013_web_archive_optin_toast.py": "5a09174bfd58d89c14a63dfd7cd554f454b0ecc61c2eb9c024dfc3ae871caf4c",
  "bookmarks/migrations/0014_alter_bookmark_unread.py": "e105e6771348b0e505e3933eb019d1eb125d05ecc009770a7d6c137e5bf51f14",
  "bookmarks/migrations/0015_feedtoken.py": "8fff1e69e4f93641c95cc7cce6440c8bf58d31a59ba99afe9b72dcb17142b805",
  "bookmarks/migrations/0016_bookmark_shared.py": "80f969cb6e78da87fb25eedc97925ac4829eca005c92bc39b4cb300338357b33",
  "bookmarks/migrations/0017_userprofile_enable_sharing.py": "020ef2e88a0cf200c9fed85c32a10efa2119228e242831712518ebe1eecb242c",
  "bookmarks/migrations/0018_bookmark_favicon_file.py": "6082dc73289679819bf11c1927ecb5487bb19c2849224bbe4fecbeb6ac682130",
  "bookmarks/migrations/0019_userprofile_enable_favicons.py": "4e410f8f9f7c42d1d8f79c636673e5a5d10a5d34ace3fcd1a08cfbba9883b275",
  "bookmarks/migrations/0020_userprofile_tag_search.py": "3fe5a7f3ef20dff95649c9b89e8ebf7abb95c00a4508ce5ed66192859fc48610",
  "bookmarks/migrations/0021_userprofile_display_url.py": "2dcf22ffa942e9738ab872ee42048625d5a7bc81bb4c6bc612f7316deb1ef8a9",
  "bookmarks/migrations/0022_bookmark_notes.py": "45d2aa4cfb0cbf077559040a328039dedb8d7cdac582671ae7e6788f0544ca5b",
  "bookmarks/migrations/0023_userprofile_permanent_notes.py": "16d0915b1a6d480d3534f122fa53e5b39e0a2bbcacbef038309f2fdaa298243d",
  "bookmarks/migrations/0024_userprofile_enable_public_sharing.py": "4cffc5f46f5985b6b3c6d5c8c37d6fa9a0adc7a22f020da57c9fdea5755d8eef",
  "bookmarks/migrations/0025_userprofile_search_preferences.py": "377a59ce5cbae99f19dea71409dfdbd5601083e34a3809caf4b4d694dbf0c8f4",
  "bookmarks/migrations/0026_userprofile_custom_css.py": "8cafc91b9497462d621df78ec0a0a8201493c627815e76fc2aab4b2ae607c3e4",
  "bookmarks/migrations/0027_userprofile_bookmark_description_display_and_more.py": "30e48cf415d6cc488195ce6348eda4ff43f8b7db47e29e8b5e322aa111ee1121",
  "bookmarks/migrations/0028_userprofile_display_archive_bookmark_action_and_more.py": "8b0dd73a9410923d0de6c388349c872f52f8361aab9a5ba396952be8e1e55e25",
  "bookmarks/migrations/0029_bookmark_list_actions_toast.py": "dbc8565c924db2966bba96a4919a26ce028e4ed55b282c4c8ae7a1576cc70a49",
  "bookmarks/migrations/0030_bookmarkasset.py": "c424e5d9496379b00b1a6303ba0d5cff992acc209123aadbfb12045cda453ef0",
  "bookmarks/migrations/0031_userprofile_enable_automatic_html_snapshots.py": "794df99cc44975707e87c15048d2ae94f03b213b63725d525ae5ae37c9073ab3",
  "bookmarks/migrations/0032_html_snapshots_hint_toast.py": "58b0099480527f63a4798a516f2fc2f50d8ab6f1b1d43f1f80985f615d906945",
  "bookmarks/migrations/0033_userprofile_default_mark_unread.py": "147682cd6289f4c5bce21d29b1571390a06b001de0929e199a82c26a2690a76e",
  "bookmarks/migrations/0034_bookmark_preview_image_file_and_more.py": "b7015a4b89f5eaf0c7a5a0dc00a7aba214a695b599e8a3f11d1157cd6afee4ce",
  "bookmarks/migrations/0035_userprofile_tag_grouping.py": "de371645bf39ef180c876dbe0dd8d63090b738c42ef9075f5262db624303c518",
  "bookmarks/migrations/0036_userprofile_auto_tagging_rules.py": "a540976baa046455163d4ddd275ad84e701b66e33ec9155769169a912a480faf",
  "bookmarks/migrations/0037_globalsettings.py": "cc4e36b479abb9deea74d5708efa55f98512876c4d4f776d73995eb14189aa03",
  "bookmarks/migrations/0038_globalsettings_guest_profile_user.py": "20ffa537b9b240254b57d79c4af0bccdb6a0713156262429189c9128a4f9f754",
  "bookmarks/migrations/0039_globalsettings_enable_link_prefetch.py": "28a8105eeead74ff7aa31a4cf5e51e5523bbb5602c3cd6a93c9e080ee6464220",
  "bookmarks/migrations/0040_userprofile_items_per_page_and_more.py": "2e004e7058301900b22a3472b1ac560096dd98dad163821e5dce72c49c24754b",
  "bookmarks/migrations/0041_merge_metadata.py": "2c68fbcab3f211c368bd411965dafdcce25a74884fa6718fac09f8991c022100",
  "bookmarks/migrations/0042_userprofile_custom_css_hash.py": "7078adb25a076ddbc3d054b3c951f2c922d1758436b2b57f21c34cfea34ec3c6",
  "bookmarks/migrations/0043_userprofile_collapse_side_panel.py": "9fc3336a7e83ec999c09c7ab7b82202fc8d12d430a7612fe251baa05d4b76416",
  "bookmarks/migrations/0044_bookmark_latest_snapshot.py": "6076b0d767d7351c965070ee4b711cb10530303592a6390a673a6dfb078303f9",
  "bookmarks/migrations/0045_userprofile_hide_bundles_bookmarkbundle.py": "f4dc1085a56bb01ffa7671ebcc51efdeb0e38a8bb6dbc2877d1726cb9c285776",
  "bookmarks/migrations/0046_add_url_normalized_field.py": "8a56de4f3be29a33e6b8ea569050a97821545cdfb53e7a9c983567e8369492c2",
  "bookmarks/migrations/0047_populate_url_normalized_field.py": "d5156bf29875b57ad968a98e570a3e46c299f501faf4c24d1f7b5b41a54d9da3",
  "bookmarks/migrations/0048_userprofile_default_mark_shared.py": "bf5812ca7d2d8f0c94bb0c9bdcd5a110772d7f71a2834f6b976c6b9d27e8b4fd",
  "bookmarks/migrations/0049_userprofile_legacy_search.py": "392acd8cec8cd18ac4fa7ee1aa63f8f0a4fa2c07bec2fa89c13ed0527458d242",
  "bookmarks/migrations/0050_new_search_toast.py": "d3ca4424104a6b6951aedc73f2e0ce25b7c43878cc8653f6d796fa253bea6079",
  "bookmarks/migrations/0051_fix_normalized_url.py": "6171e8007bd35c60e3a5f7a9540c59645bd659a8f242e42fd6103f711dd817f5",
  "bookmarks/migrations/0052_apitoken.py": "4764ebf9b17ad3db3e3ea5de5666700cebc1487dcf9d4cd41d311ba73138331a",
  "bookmarks/migrations/0053_migrate_api_tokens.py": "584d3e6d49698f64e6cbdfa8a7f87d7d1e2e02abc079740244b4f695fb1eb8e3",
  "bookmarks/migrations/0054_bookmarkbundle_filter_shared_and_more.py": "4e8910ce0c1ae0dd225b4ab5fbd8988430912180a0aa7b8153cae36002642b2f",
  "bookmarks/migrations/__init__.py": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "bookmarks/models.py": "836f9ece7df7f9e2130190a307db11155d1c11f00c187ea476af9b79f92d8472",
  "bookmarks/queries.py": "6d69581c2b31ee1cbe0fcb307285dd975a1fd49b83cdfeca024cd00cd6e595dd",
  "bookmarks/services/__init__.py": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "bookmarks/services/assets.py": "325a38718820d212249e3a615ddd74d0d8dfc408ef37f6a50caa517648c54b85",
  "bookmarks/services/auto_tagging.py": "ae98015eb83027b6ea87444dc05a3e0ca30160f045f011c0135e791deb25a51e",
  "bookmarks/services/bookmarks.py": "5c6f1de8ebea064bb2afd7ac5a914a72f2207b4f216475815c2577108a2da47d",
  "bookmarks/services/bundles.py": "3cc30b2db1ab81095e0d4982767450b6b2228c5df0ee7b0e53351859ad5ad441",
  "bookmarks/services/exporter.py": "1cfa381f6a31fba35b8a654b64297628d239c76a9789efca46222d987d8bb1b2",
  "bookmarks/services/favicon_loader.py": "2081243a88a340874fbee7374f578bd4d5b660e8414f48b53af4834c02182ab6",
  "bookmarks/services/http_client.py": "a9ed0aa3c25df358d152e0090c24aa79e9943006acb1f32c79415e9d98f4d045",
  "bookmarks/services/importer.py": "3b7e386697afd6d77cb2a2e13167deddf23d761713ceeba67088a070a0bcb26d",
  "bookmarks/services/monolith.py": "ec434bf4cb3f1f2164f6a644deaeed732a9fea2282c3e51c3f7b82aa85a20fee",
  "bookmarks/services/parser.py": "e285b9253f3f2db216851473101d3e21085430f0a33054b09f40c3aef70eee0b",
  "bookmarks/services/preview_image_loader.py": "85090360057aa64cd037f4ee12524fa838cfe80657fb3965d09d9afcd741acb8",
  "bookmarks/services/search_query_parser.py": "91d75bce7c2eb26f1e9d8fb045d3632a7ec875d35a9bdad4f571005c5e21f9f9",
  "bookmarks/services/singlefile.py": "ff286a312fc87074c24a96ed9b50e1ebc93a6ca7352aa25b097ed6b73bfae874",
  "bookmarks/services/tags.py": "ccc4bfc43f59a3d53cd27a5cca3ca0b09d5b533b982b610dfb9768ed6752ecfa",
  "bookmarks/services/tasks.py": "07130b7297b92e53bf440da1c22ec602fafb326568ec606d8fcac9a391e81dfe",
  "bookmarks/services/wayback.py": "e3d16ea45b7f352428d69c4a20d1bf7f21d5b93b93eaa013804335c3ded551a0",
  "bookmarks/services/website_loader.py": "cfea2ab91a9cd17a91ad33f7700a88efdf69efdb9ae5d206b66862ef176fae47",
  "bookmarks/settings/__init__.py": "ea2b9d3a8a1e555137b4112da8b844a7c0140f20e994d70c940169b85f03950d",
  "bookmarks/settings/base.py": "49e5940227ae8edac260bd42b514f653701605511622080b580991b12482ca7b",
  "bookmarks/settings/custom.py": "c04543a48e6cbbb3ae6a2a9d4547b0518179013deb7d5082c5dff45c07a3739b",
  "bookmarks/settings/dev.py": "1cab18d4a085d82e49e9fbec77ee1b2c1cf2f0cab7d0f3711a7ad790d08941cd",
  "bookmarks/settings/prod.py": "00827310b19cee47f9f4e543d8a40830315f1414edd9f2b5968af7a47f63b9d1",
  "bookmarks/signals.py": "47367776ef93624a1b708a7ffe5fef90ea6dcfec16f334890fcdbc125fc75b1c",
  "bookmarks/static/apple-touch-icon.png": "253839ed0b7cb1d92b51668a4ee9d6f9c2e930d2435fd0c138bbdd31ade0e695",
  "bookmarks/static/favicon.ico": "56338ffb3789975c26b4ba2a461227bc00acdf986f03e9264a51825e6993a4f0",
  "bookmarks/static/favicon.svg": "2c5a71a01a98ba824065d921ac53f1d16c2cf0184889101ef2e4040ab2d9a477",
  "bookmarks/static/icons.svg": "648104ae09c37e5f90c71f542bb853c1fb0cc436d59519bd0c6390b19031a474",
  "bookmarks/static/linkding-screenshot.png": "c31006d71966ac20faa2d24c8b76fc039d29458bbbf97d150841dd0c9d9485cf",
  "bookmarks/static/live-reload.js": "42b19d87230d2543ab67469c5f2e52e3e83129b867e18d2d0a9f391dbf3df706",
  "bookmarks/static/logo-192.png": "a4a1626e1728eaaeb40586153a74bee27110ee0e72e6ff7c9d7b8299b8645475",
  "bookmarks/static/logo-512.png": "d4c399a3dec56b0aa45e6c260800266b73421bd7f719881aebe7cdbbe8939d13",
  "bookmarks/static/logo.png": "b52133b0136cf40a3ad229941e9750371b30ce241c4702f155babe61e03dd234",
  "bookmarks/static/logo.svg": "9a7a04afa8c933fc782419099931ba36030f088ace3f161e1746c0e896e1346e",
  "bookmarks/static/maskable-logo-192.png": "f99a17d953de0b0d36f39c710e6a764391ffcf88c03919d51838b81bc2d65614",
  "bookmarks/static/maskable-logo-512.png": "55c82586dc1d4242de06e2700bb41eb3e3d4dcae1f2eadcfac4ccbb5e1f164c1",
  "bookmarks/static/maskable-logo.svg": "a76b1494cb00561c56c33b52e96a6b83472b943f76246b9c95d0c92dc6cc8323",
  "bookmarks/static/preview-placeholder.svg": "427d50ad15e56a4931fe491c7721147c8d02b0969c3a44404b3149a44a556878",
  "bookmarks/static/robots.txt": "331ea9090db0c9f6f597bd9840fd5b171830f6e0b3ba1cb24dfa91f0c95aedc1",
  "bookmarks/static/safari-pinned-tab.svg": "18df659796ddcf03ec9f275909efc8cbd350fc2294bc2402c93461e38dfc9c7f",
  "bookmarks/static/vendor/Readability.js": "61521a78d29e60def9623a14ebcc5a54aff88c61fd11326d7c016478a4f23047",
  "bookmarks/styles/auth.css": "81c927b0e94208b68794371a976a356ae342dec44a12975061d14f1dc3e54541",
  "bookmarks/styles/bookmark-details.css": "37aa15eb23e3c3b0139deb8baef60b044d00e690cc88ec2698c68b7056196f40",
  "bookmarks/styles/bookmark-form.css": "5bab84d86d262972884dcbf18373d087ce8a2d0c078a9121d4a80794c48d3df0",
  "bookmarks/styles/bookmark-page.css": "81111496ce049c713fc228af65a1908caff97cbe04e951233c99406bfe15f74e",
  "bookmarks/styles/bundles.css": "cdc38999ce88ffaa992dc2e389701f102b070728dd44d15247842cf4af1464d4",
  "bookmarks/styles/components.css": "1115738bc5993508e9b7754efe2d1dcd3dc0338a7d96ac193e5a0b747546447a",
  "bookmarks/styles/crud.css": "8ae36d78876e6a014e6a6bba50caf2c16ea15aa30d1fcad66bcff147fb4f60fb",
  "bookmarks/styles/layout.css": "5316c258363b78042d4aa6e657541b4106e71d2e1acce65d51fb4aae1b72eb1b",
  "bookmarks/styles/markdown.css": "a40b6a0a66632e90fbb316879e56abfbc4913d799fa64f826e6b65383184fc9c",
  "bookmarks/styles/reader-mode.css": "f6265f5cd2fcb4c6f63c7dd9b278bbc185ada26fc5d870c08dfcdd578a13b5a0",
  "bookmarks/styles/responsive.css": "7077762adee1eb726f4a7918458d311093f8575e7b731249eb8d631b8a6788a2",
  "bookmarks/styles/settings.css": "291ae1bd5191d54b2aac248863e8889ee0c44177023cbe0337517bac1103a9cf",
  "bookmarks/styles/tags.css": "9c7963bd71afcefe2feff301dc332badaa35b8858c895b9bbf6b2465bcc6ea48",
  "bookmarks/styles/theme-dark.css": "674af8a022f923c2c612f9b5bb5dc8f0dc23fb8fd2a89f47b54c2b60237f28bf",
  "bookmarks/styles/theme-light.css": "a126b35909e0e5088f2d9675b31743a516e182d425747629db3b0c03eebe63cb",
  "bookmarks/styles/theme/LICENSE": "30ca73ed0d18d0e198428000b0fd988896fb203eead2c47901a5dbfed6792690",
  "bookmarks/styles/theme/_normalize.css": "bba59fc6ec62f78f7c4b716434ae075db0d44c53a0505498a5e46b96456e5357",
  "bookmarks/styles/theme/animations.css": "62517ff75da07e5f94c8722273bdb9c374420c7bc14debc4a4bfdf46336753a5",
  "bookmarks/styles/theme/asian.css": "a3b30a78d47c00eb1e652eadc66200ff9cc67b346cbe5e86166911acea4e5b1f",
  "bookmarks/styles/theme/autocomplete.css": "01adb7f135dc6fc4b9370e89706157b825a856020c66f464c4b88392648834f2",
  "bookmarks/styles/theme/badges.css": "24d7d353e9b7ab3154f7d16e051c269ce5e519e89030557ff64514a6e0862e8c",
  "bookmarks/styles/theme/base.css": "652d8ed34027109b6cbffc98783a4bcfd5a3a383c4efad87b880bba35b261f56",
  "bookmarks/styles/theme/buttons.css": "c18ed1266b2a40a9b82a9b2060268ba20a9585d1879a6a15daa7ca71d403c484",
  "bookmarks/styles/theme/code.css": "770c31a808ea8804ccd6c457adc59f45608389cb6f698d2e188ae829e477ef3a",
  "bookmarks/styles/theme/dropdowns.css": "168529b7aa9fccd969d39145df15d67de12c3ce13160650b4fb50b7eb7fe52af",
  "bookmarks/styles/theme/empty.css": "6a8e3975fbfe63e18762b009849ab89a3f45bfffeec0413885cff8a233539958",
  "bookmarks/styles/theme/forms.css": "3702874cd198f8e474a07bc130482b2d2d7c2a6cd6d60190769e2ca3d25b90f6",
  "bookmarks/styles/theme/menus.css": "510bd69175783a1598a0cf9cb028f0f6aeb9908c1f75fbc49f31f8e3d1368618",
  "bookmarks/styles/theme/modals.css": "bb98bd21e660211f2ffce6bd527b28ef4ebf275593d3ede6f0699ba31c3a5b58",
  "bookmarks/styles/theme/pagination.css": "60235d356a7b1d4ec13a187dacdec09a980423d6ff98ff8af78b6ce7f0a45de1",
  "bookmarks/styles/theme/tables.css": "6dc9c58ab71af25d006e3a251fbf027f99908804ebc19d27b790451e43a4642d",
  "bookmarks/styles/theme/tabs.css": "009a057281b179db1435b9830f0508f74287e41630b2635b99cc429ce4f9836e",
  "bookmarks/styles/theme/toasts.css": "517dab1d7abcda5a539a471c201c20fc2ad9c017600ab1e24a58b9b592c8bdbb",
  "bookmarks/styles/theme/typography.css": "96969828aa27ac8ca51a5bb515d7596d7c5ad903b9e0baf1fae2599953637ac4",
  "bookmarks/styles/theme/utilities.css": "c1a4e8db88ae8412515f7cba7fec370877bc023d3684b1c228f7ca66a0e48c22",
  "bookmarks/styles/theme/variables.css": "e94e821f02f972931c30b66948c151e59f7a20c30bd4b3221f5d89b93a833fd8",
  "bookmarks/tasks.py": "a11ea101ce5ef30b6ff3bd1279286acc3cee6f70427bdd8d3e3f3b4e45c4c733",
  "bookmarks/templates/admin/background_tasks.html": "c133cff3040073a29527f427c2fe8dbffbbed1b17eae5d70e05af82a41fef624",
  "bookmarks/templates/bookmarks/bookmark_list.html": "f7e72fab1505e3ad77d40a6f49073bbbce552c68afcac46434e1586a9c32797e",
  "bookmarks/templates/bookmarks/bookmark_page.html": "2242d0956be0635424c6b70c01638d76cb0a417cab0b853b95d71adeadcc7f51",
  "bookmarks/templates/bookmarks/bulk_edit_bar.html": "45097915846a60f0e00fad93fd87cff9667f212561ba82d65e4b89bbb5c23477",
  "bookmarks/templates/bookmarks/bundle_section.html": "61927e669afbc7e30d1ccb3560c901296ecf15307a39a4d0e37b99bb7bee85cf",
  "bookmarks/templates/bookmarks/close.html": "f0e74e3c97767448424575a076afdd1fdd2962ff2485d738f45fdd248fd0daa3",
  "bookmarks/templates/bookmarks/details/asset_icon.html": "2316556bcdf968035c8ccd0f2645b3f47a859884837ed01d39559a94a671cb2c",
  "bookmarks/templates/bookmarks/details/assets.html": "e2a41f00221105b19b00947b1486faf061cd8f1076a71a717f45282f24d1e007",
  "bookmarks/templates/bookmarks/details/form.html": "2e013e2de719b0fd26245edbd11485e54425bb818d39a6d209505bf323d33c86",
  "bookmarks/templates/bookmarks/details/modal.html": "877ae58da2ca80e66534886d581b1ebac7a296b9cf2e6ec33d6d51caf66a193f",
  "bookmarks/templates/bookmarks/edit.html": "f544353de6102efc74dc2bd9f60197fdd3627e259bafe2ea4981d650bebccb82",
  "bookmarks/templates/bookmarks/empty_bookmarks.html": "e9b050a3262dfcdcdd0a950ff38248f40142074151b32af6d187dc2779a05e43",
  "bookmarks/templates/bookmarks/form.html": "1216e1ef7737ece96b8172ead51a221ad4e85727331dfe515b610f626578022a",
  "bookmarks/templates/bookmarks/new.html": "dc112647546216654c062422202e9b17ad533a9ac7a0f5f51614b6649335918b",
  "bookmarks/templates/bookmarks/read.html": "db524c63c5a9186b6c955d8942205f791b8dade85559da66b8b7f276824c4192",
  "bookmarks/templates/bookmarks/search.html": "4e9aa27645732c8b292b1f5c70adbaf4c5cf9626a06309b3a267bdff981bcf5a",
  "bookmarks/templates/bookmarks/tag_cloud.html": "e9fbd9c9cddd912197dce8d900f53af06094f5c840c639e7ee146785b0ee87f0",
  "bookmarks/templates/bookmarks/tag_section.html": "3ada06f998bcf298e1dcd03afb72494c6a834c754eaa9ebdcefc52ff2eafb065",
  "bookmarks/templates/bookmarks/user_section.html": "e7a0ad77acd4915aef1903fec9b03848cff4cebe02ce028c8056ef950f779eb7",
  "bookmarks/templates/bundles/edit.html": "2ea29f43fec8f18e701d7194deb091cc6ebfc5c4a515b7e02af3fb9843b01eda",
  "bookmarks/templates/bundles/form.html": "f547d23f5f08e41dc128218a8fbd1d0ad58fb669700deae993786b5add5391d1",
  "bookmarks/templates/bundles/index.html": "236b83f25e2535fd6cea013ac6b66262ad0d30d2fc99a6705808f1bef1471eb0",
  "bookmarks/templates/bundles/new.html": "a4ba90bac2208f4cf6660aa2e8987d89462b5a7a6a9085279efc2202a3480bcd",
  "bookmarks/templates/bundles/preview.html": "39e27c85e6dc890e46218cde4526893eac5dd863dab195ab5b16737bc7d7ba7f",
  "bookmarks/templates/opensearch.xml": "7ed21a6bc16039c0cbc6d5affd7a4ae9988256fd5a55321b97584107d64fe218",
  "bookmarks/templates/registration/login.html": "8e68d401e6ec0a51e4c2377192aba95ee2dad3cc74485c04c77ad4b3cf04418c",
  "bookmarks/templates/registration/password_change_done.html": "9ae87add7fadf72bb1d6a4e4a3d73f61107a7475ea27817dd1c765252671d3ed",
  "bookmarks/templates/registration/password_change_form.html": "3d91e5bbbc6fd3169b29cbe3ad8ebdc053fdfbee60abfe9226d3f402bf03d1bd",
  "bookmarks/templates/settings/bookmarklet.js": "87dd41242ce496d43f356a3aae19131134a5945a067b794cf9134650d12266b8",
  "bookmarks/templates/settings/bookmarklet_clientside.js": "0854b64d8bd41b8c73d4a73a39a930e012ef3380664618b781d69b6e562eb058",
  "bookmarks/templates/settings/create_api_token_modal.html": "96073810b41ff2515576ebfc67a0d31b8b57e49336a8d50d050844a9941b5abc",
  "bookmarks/templates/settings/general.html": "c411189428c4c7f823723e5e7f2e1eac9ee30bb5694428e8ecc80eaffdcbe118",
  "bookmarks/templates/settings/integrations.html": "06ee73617c810b44880be4d0443b4baffa4a73b5b2187cf4a23c80568235b642",
  "bookmarks/templates/shared/dev_tool.html": "bf97123e4e68bca945a0e3a1e1f5651b685f8e392932a43acd8512ef537a42bf",
  "bookmarks/templates/shared/error_list.html": "451b9278629853e3163dede68318cc38eff06310781cc5095741d34661e48f08",
  "bookmarks/templates/shared/head.html": "bacfb591df50a0aea6d30028e034c71efa2c236c0ec39ad457dab03bd08b1388",
  "bookmarks/templates/shared/layout.html": "2f0a480deaefa3366508f4489334f89f91b2bcd8e7ceb4e2a071cc6438e6c7a4",
  "bookmarks/templates/shared/messages.html": "84e9d5f3f2ca71aa0a3be6f9a205278a29b49a15bef03ac8a8c3718f31f34d8f",
  "bookmarks/templates/shared/modal_header.html": "d5d6258bc458262a6e4850eb77caf69230e22a4902cfe6aa059e35a820b0aa0c",
  "bookmarks/templates/shared/nav_menu.html": "1fe64a4e0d1614f69e9f9950c49ca6f03cb3bf52896653d045b1927121fa8ed5",
  "bookmarks/templates/shared/pagination.html": "59852d585929f7ab9e51c52a7508136ef698707c38883c80147de251834cb33c",
  "bookmarks/templates/shared/top_frame.html": "0298c31bc9a14ce3449c8949781a514c6cc93f2b552cb13141be6ac85c1fe60a",
  "bookmarks/templates/tags/edit.html": "a3f383dd74a31101538e74a2986bb1515f7fabef52b6725922623246585cf9f1",
  "bookmarks/templates/tags/form.html": "88e2412d3921a37b9dea0c69a06b62e569ddfad3824831f0efb51b27fd2998d3",
  "bookmarks/templates/tags/index.html": "e2079f5ec3575d43085a9c868acc242f641d8ff608f25b1e8656d577bf93a442",
  "bookmarks/templates/tags/merge.html": "12fca5484dbaa965799fc6acda3d5537225843ff121b9d7c9342143ddc79c92e",
  "bookmarks/templates/tags/new.html": "23fd50bf576db4528577732690d41958161b8f540e8558559a9cb5a4f35dc096",
  "bookmarks/templatetags/__init__.py": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "bookmarks/templatetags/bookmarks.py": "2af4749a6eaf9139acfb45e1f02dd84e7671ef1e6e9e8b33a2417dd28508c494",
  "bookmarks/templatetags/pagination.py": "ea1f85058d0002cee6d1fe81e36d5036fef64793b00bdcc3441bc9746e822544",
  "bookmarks/templatetags/shared.py": "048c79ea4f089b4de0d9ed84b0e821996a2f60c299dc14c38eb167589dccfb61",
  "bookmarks/tests/__init__.py": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "bookmarks/tests/helpers.py": "bb28a98dc2e780d11051d2546fc5d3ede4b83c5ea0080b6b0b5b9b9d60b58b90",
  "bookmarks/tests/resources/invalid_import_file.png": "1acaca3b79255240dec6f7bf7cb723831bdc1e3dde5d9ea2d275aee30c6b03d9",
  "bookmarks/tests/resources/simple_valid_import_file.html": "1c6aff69039bf72f9eab531093eb09404f3b151820f2b76223ac76a46ba907df",
  "bookmarks/tests/resources/simple_valid_import_file_with_one_invalid_bookmark.html": "d33e10d6c144e6bb87439437d45942a3bf2f0705258b974d2bbb12f731ef8761",
  "bookmarks/tests/test_admin_background_tasks_view.py": "ea0ef82ee8ca4620ecdbfbcf0ceee8d3d12401542ec26da32b08fb2633ac4264",
  "bookmarks/tests/test_app_options.py": "3830f245c0a990097aba5bcc75fc1c207d17a30df8236ce2ab4439061d1c0861",
  "bookmarks/tests/test_assets_service.py": "c90f2fc634f7b2673a1504a8a847d36d99b3bcebb449c5ceaff5088a057f8620",
  "bookmarks/tests/test_auth_api.py": "82c95e63aeb74b0b38eaea297f649bceb9b7f66db426a83cf93e99f9bcfdec7c",
  "bookmarks/tests/test_auth_proxy_support.py": "474343a1b5199c8b6531a2b12e335d780c280fab71d22e1d222a1d694aeabaac",
  "bookmarks/tests/test_auto_tagging.py": "5c9a44e4daea08609a20b4d6e05b44f3fd7e27c269ab6baf185521888a7befa2",
  "bookmarks/tests/test_bookmark_action_view.py": "caa67a549fc4fe0bc64bce217f57899c5eebd0e2be7567fd5b766a5099dd9dc3",
  "bookmarks/tests/test_bookmark_archived_view.py": "e31b2dcd38082d0d5567716132d96ee9ba365c0e74f4e8a21594e68a184be238",
  "bookmarks/tests/test_bookmark_archived_view_performance.py": "5385e680de97c05546fa8b319b021518896e11f11efd2bbe43bd5d83634d1a99",
  "bookmarks/tests/test_bookmark_asset_view.py": "713f2bf59753852026286570fe661709592c259926d734167bac247b1b14464a",
  "bookmarks/tests/test_bookmark_assets.py": "22f3f66fc7c30f0f3b3ff8c35586c03d87e644cb8a3dfc78cae2437b8cb5f1e4",
  "bookmarks/tests/test_bookmark_assets_api.py": "a51d09326eb70dd8a294eb3e88fc8789c827c2771607e7a4f6dbd8f6446394a7",
  "bookmarks/tests/test_bookmark_details_modal.py": "2ae0827f3342f5ba40b818e423fac4202d98d0d3e647ef0c89f518d272382530",
  "bookmarks/tests/test_bookmark_edit_view.py": "7cf45c1912122cc1b0685a94ce6f0b89b1c49b4e220832b21c2ef351e49beef3",
  "bookmarks/tests/test_bookmark_index_view.py": "7db23398edc5b2692ee5de2451666d133bb945090d36e8fd01b3444672dd48c6",
  "bookmarks/tests/test_bookmark_index_view_performance.py": "c3c97f6e2930feae0a0d08b9350f29185d0644b467b362c311215d4699df96a6",
  "bookmarks/tests/test_bookmark_new_view.py": "12e4205483298affdb9b371a95be7cc208641a718f844067b2fcedb1d64737bc",
  "bookmarks/tests/test_bookmark_previews.py": "8e508d412f81e1115b6aa6ec06ae40f375a4f7efd98acb5bd9f9020c1659453a",
  "bookmarks/tests/test_bookmark_search_form.py": "8f7e3f27ebb92931ab0c9957706ecde55ceb0ae6a6093677e8d3d95974ff066a",
  "bookmarks/tests/test_bookmark_search_model.py": "55fa48f9ec0604410157b9210f5eaa52eb7ffa06a6c52371d313c78e92d43d06",
  "bookmarks/tests/test_bookmark_search_tag.py": "e66cea7c42e1139173b2b04c393c4ce5121b98b8e18b718cb26f2c8aecd44d57",
  "bookmarks/tests/test_bookmark_shared_view.py": "356517329e959f814c0d919c49793871f4e0c8fd4bb9b5ed28f75e8d4aee0aa4",
  "bookmarks/tests/test_bookmark_shared_view_performance.py": "a162a54d983e2f785f93efa93f1bf1e30f3066917de5f50d44093cb7dce3de06",
  "bookmarks/tests/test_bookmark_validation.py": "18f4d74eb68fc28c08566bdcd33d8bcc12b0ad4007dbf42201a4379d84f12257",
  "bookmarks/tests/test_bookmarks_api.py": "95db70e9e60509ee95f55db03cba8d13cf1746a40b02d87b700298135c9ede36",
  "bookmarks/tests/test_bookmarks_api_performance.py": "c2e5ce03a9d1fe093b8a107deb764a98787f4884bcdd1a97516e6098b9add9c1",
  "bookmarks/tests/test_bookmarks_api_permissions.py": "8a3ddc21da4cb3b6aef9f01bfa5dcb036285b896a0274af01ab02f73f59eeceb",
  "bookmarks/tests/test_bookmarks_list_template.py": "5f70869f368ba967002631568804ce75c6726a8a3065c43bc7b19b55e167c867",
  "bookmarks/tests/test_bookmarks_model.py": "92d721a8c1d305ad9c1b4fe70d211287639a9962a9336617a128a84cc3e093ca",
  "bookmarks/tests/test_bookmarks_service.py": "43a78b3edb632c55262830287d4179a9528a77eac649ffae06c42c29e54a1370",
  "bookmarks/tests/test_bookmarks_tasks.py": "fbb3f4946a216a11d613ffbaef171f2289c95ce1571b48cabad699ca95f713a1",
  "bookmarks/tests/test_bundles_api.py": "99e66f3c0738cd2d1cfa6499ef66bc979396634a2c87a3aeb91081d12a18f42e",
  "bookmarks/tests/test_bundles_edit_view.py": "aa1b926fc1ba76c7961bb7853417014968ba3626050b51f6362c3aee6fd57eba",
  "bookmarks/tests/test_bundles_index_view.py": "29e1f0f1755310ea0f0d260769c1846785c76e2b6b81fad06072867589a8f636",
  "bookmarks/tests/test_bundles_new_view.py": "9b5f056372171cf42de19088a37b42ad54a50b9a2f1e14c7ceed15cfc3e5ee6a",
  "bookmarks/tests/test_bundles_preview_view.py": "a38d2681e1fce26e1c3ba8d0bfb2453c605112f2264aa05b809e031f15b47aa8",
  "bookmarks/tests/test_context_path.py": "85547a4e4bfffa8a1dbb3f347fbdc8a7afe635de9057dbe5492b865b771f32ed",
  "bookmarks/tests/test_cors_middleware.py": "64b56ffdc3bd9dd03294b8042680d7d0f04d811788c0f3182520c3f677b94f49",
  "bookmarks/tests/test_create_initial_superuser_command.py": "bcd45fe4aed0248a39a1604475e64387419b26dd8a2371446124625d5708a4f9",
  "bookmarks/tests/test_custom_css_view.py": "cdb906413d0962ff070b2dd7760249dd9cf69a57192fb63665b7bbbbd6529a2f",
  "bookmarks/tests/test_exporter.py": "084dc09724dc572468ff2901ef6004c0c2126857230b7306de26bc4301f99b37",
  "bookmarks/tests/test_exporter_performance.py": "7bdae2729d1b8b7b4838e89ef004816b8cac5086c63e07aef0d15363b601488e",
  "bookmarks/tests/test_favicon_loader.py": "6085edb1a813a5203a45aa0a1148e0995e0c1d4f6ea0fa7a4f58d245871ed8da",
  "bookmarks/tests/test_feeds.py": "5569e91117f742df3c9721cb3f1e1be1a6a6488eed337468de0ea6475b3ee095",
  "bookmarks/tests/test_feeds_performance.py": "7ac70163c1cada53da32e7ed6d05861c1c6388f469b981130a5abecc9b3ef8e1",
  "bookmarks/tests/test_health_view.py": "6117266870b8127c90c5e188c9c4b8b0969a19cea9ebc5cb29b6b9eb4137500c",
  "bookmarks/tests/test_http_client.py": "3dd8c3372a058da1276c59c5c8c6c84505a09b38630a0473862aa651c0f8edff",
  "bookmarks/tests/test_importer.py": "5385d7fcdf1ac9ecc8be521cea168213df39b358aa32873a63ce10974d241abb",
  "bookmarks/tests/test_layout.py": "abd1e2b5f961e3a64a81a49f43d1e65af1028bda3b0af05c0e1a2b368fff0372",
  "bookmarks/tests/test_linkding_middleware.py": "9536aeb4e84dfc982c8e9b431f84ef37e60eb28dfe8348a52e9154f84b43af19",
  "bookmarks/tests/test_login_view.py": "eaeaa844a6b195d98efc539328b966953935a3b48d1b620254c8d3b3aeff1083",
  "bookmarks/tests/test_metadata_view.py": "a824356bcc62e987ed33ec592e227d7a93e086d78970479259e2905dea93178f",
  "bookmarks/tests/test_monolith_service.py": "7a2d627e5df830d0483824184b8f0334b775653a599a5360495b9edc1ad36bba",
  "bookmarks/tests/test_oidc_support.py": "aa1bc7fe73180a47a2e8160fd2bae7fe74a0b7467cd554336b1b66857962d547",
  "bookmarks/tests/test_opensearch_view.py": "f2f5bf6e784f825a07e3c9a5b77c1630d54112cc3e3a5d45b49eeabc1f73c3dc",
  "bookmarks/tests/test_pagination_tag.py": "f899242d58b418e33630c96ca4eee09affcf0415be8809fa7be950fa9e949d67",
  "bookmarks/tests/test_parser.py": "09a22280c570079c79c50085dff3f71889a09a42e53ed808227c2eb818aa3cb8",
  "bookmarks/tests/test_password_change_view.py": "8f1dbae313bc362eac3d33d5d8e8b00fa2ef187639e19e248d73eec746b60cb7",
  "bookmarks/tests/test_preview_image_loader.py": "68f4b25c5be1c65162486e0ec068395673811b4666fba8d715b3fac6dd4675e8",
  "bookmarks/tests/test_queries.py": "6eccf1abf0c763edd91acab980d60681b22cece1effa8044ddb9cb897661a1ae",
  "bookmarks/tests/test_root_view.py": "551d8d519df47621c24d43e7e9446254c52c996eef8b12d4e4fa504eb654348a",
  "bookmarks/tests/test_search_query_parser.py": "984859017532208a6b36bcd52c0f88cc542a8b768e0eaee66d0f669865cab971",
  "bookmarks/tests/test_settings_export_view.py": "50a4464d3cbcb4f78a04eab072911925be4d9d08b205546ce1a692ea5d6d0b6c",
  "bookmarks/tests/test_settings_general_view.py": "072951e40590cd8e89a5a15914817073c63842c7a4aa98c74d44a7547aa438d0",
  "bookmarks/tests/test_settings_import_view.py": "17f22876cbb41efbba08c58bcc040bcdc7f723f3b48cc89873e614e0daad0a53",
  "bookmarks/tests/test_settings_integrations_view.py": "091abfe2b89f3302ab51184a3e86a5e21cd3ca699c27603876af4d259be9cfb2",
  "bookmarks/tests/test_singlefile_service.py": "7fcbea862b0141f549664ebc1544332bf3be0ae232446f750f566170694164ec",
  "bookmarks/tests/test_tag_cloud_template.py": "d979f161cb46173ff3488e1d5a9f3a8472db95b7a805f510611f9361e66da2c7",
  "bookmarks/tests/test_tags_api.py": "c86c6c8940ef283b3db8a9b14b00896d217e8e85bbe04882c6b39389f7252f73",
  "bookmarks/tests/test_tags_edit_view.py": "49d80a1a860b7b414145cdd312861d69f14b9c82deccf1714ac4f821cee974a6",
  "bookmarks/tests/test_tags_index_view.py": "186abcc97638a97a6ad6414461b742e90acbc5238492b6b1b1293006f16ab2c2",
  "bookmarks/tests/test_tags_merge_view.py": "9383fc142beb8a4df66e96f0955a42b693c8670251c3fdb2777391b241139975",
  "bookmarks/tests/test_tags_model.py": "91ac2fbd47a70b7e9283ac10f34c678a8519c80072085615941b91b3d7a78f8a",
  "bookmarks/tests/test_tags_new_view.py": "0f428aa4db228727d86d1c1d2092141984a3fddc2a5f4f0f5918aed07a279a76",
  "bookmarks/tests/test_tags_service.py": "b9daaeae8136d98392648144a4a0915d8799d4d12cf4753a75e4952e428a4ff4",
  "bookmarks/tests/test_toasts_view.py": "18c680d651b77e7b6010878f2740c0476dafcf6efe8637a4f9216c1975dde115",
  "bookmarks/tests/test_user_profile_model.py": "7537fd881c2dce59ac0a7b2c1edb98e5a58cc330c3b77bdbf05167146574869f",
  "bookmarks/tests/test_user_select_tag.py": "8bbdce8ce20111186c339a20429809ee15c2d4cf5ba6aaedc3cbb2e851d183b8",
  "bookmarks/tests/test_utils.py": "8a07411af68d8060e3a7c908e66923ec5c11a88af814ae0b0e322813612a34d6",
  "bookmarks/tests/test_website_loader.py": "53b1eb701b7117527943189a37223c0e1529d93d081c85c7459d4badae53855d",
  "bookmarks/tests_e2e/__init__.py": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "bookmarks/tests_e2e/e2e_test_a11y_navigation_focus.py": "cc411bc554d7f00d838aaa625960c938dead6e38e9c7889b3dbb6a485604a8c1",
  "bookmarks/tests_e2e/e2e_test_bookmark_details_modal.py": "f81530af50e3576f2f025d29cd809672dc27566449c85d19db3ea7ce458c8ace",
  "bookmarks/tests_e2e/e2e_test_bookmark_item.py": "bdc4faa2bb4828a204c68fdcd3191df7e4c0dddb8a0a3a1a38d9a560822f2fa8",
  "bookmarks/tests_e2e/e2e_test_bookmark_page_bulk_edit.py": "702b26b07acdfe96703547f2155efd31c4dd731834e3d0e5f90a9ae5910ffc2c",
  "bookmarks/tests_e2e/e2e_test_bookmark_page_partial_updates.py": "bb06efe62644171565aac3fbf5f4fda44fb5b0b21a2889819aef705bc4ca3cd2",
  "bookmarks/tests_e2e/e2e_test_bundle_preview.py": "57b54f6c141d44b67c9ca0a9b03994a30d8de5fa18cc0fdc7c3ad0d9321f9bed",
  "bookmarks/tests_e2e/e2e_test_collapse_side_panel.py": "675657e7de7374d4ce2ee88d8fdefe350565a3a7d2b3c56221323a650fb780e9",
  "bookmarks/tests_e2e/e2e_test_dropdown.py": "5d1f26a2de5f86f792b17b5a3a72de575b86f94f701310ba042675714c97c250",
  "bookmarks/tests_e2e/e2e_test_edit_bookmark_form.py": "5acd853355a477d4883e275891cbf92d3abec8a77fa32820c3cc65422af93854",
  "bookmarks/tests_e2e/e2e_test_filter_drawer.py": "1ed2ef975a1eb942fb44e8f9dfd6731d74296212b2878c91cdf6271fcbb7999b",
  "bookmarks/tests_e2e/e2e_test_global_shortcuts.py": "5e8fdcd64f0c598e55fba78073f2904d598c156bacf7652995305c7ee60e0443",
  "bookmarks/tests_e2e/e2e_test_new_bookmark_form.py": "551bc3288d577e4620f13995966c9203cf8fb7102729955cbd18bff536a3b181",
  "bookmarks/tests_e2e/e2e_test_settings_general.py": "1242276cc689573091758212b234dcb2bbac59353b7e81c10fd4d3f1b6649392",
  "bookmarks/tests_e2e/e2e_test_settings_integrations.py": "858d0c3afe88870a69b4ff4755ccf8dba3cc76be4462c0adcb04f97f6747ded1",
  "bookmarks/tests_e2e/e2e_test_tag_management.py": "86c4edc19aafb2367a484d908aab109c49baec9ff64cc7a788a48af4f207cbc0",
  "bookmarks/tests_e2e/helpers.py": "38102bab255d5c770b611179591b8fbb9a9c9caf4b8d9b9c2494b22cf9a2bb1f",
  "bookmarks/type_defs.py": "56c829400b2907e796563ba5733305767316edd1ee7fec8ba8b1636a2825dec7",
  "bookmarks/urls.py": "7e81e1ac193805a49c8cb61a686bd382cd9a3e405d480066b9413564212cde6c",
  "bookmarks/utils.py": "44fc0bf9dd58eaf606b1f89e1b9af207c1f2ab8462c0beca650cc73ace2fd5a7",
  "bookmarks/validators.py": "91e9432de40a06197fbf6d51a38dbb23c9db8ccd83c9716267c92699e55f2f11",
  "bookmarks/views/__init__.py": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "bookmarks/views/access.py": "abc24fc634a1d9f3c60b16df01b94640fb6bbfd567bcb805f37c520ebd5d41e8",
  "bookmarks/views/assets.py": "987b3456df9176a8c5f2f2e5ff35b6d667289f48af9c17c081e8114d2dd28efa",
  "bookmarks/views/auth.py": "ef4d925e85b000dc2eff4d3e976ffcac4f257da0aed54103de6e7157605cc2f2",
  "bookmarks/views/bookmarks.py": "e7984b79e46e7c52343f9ad8f6a5d27aa20a4417ad9f2f20c760d8118351859e",
  "bookmarks/views/bundles.py": "9ea28402558e3d874a38bc236367b1922aecfae318e8dc31d9d777f78aee77e2",
  "bookmarks/views/contexts.py": "109956ac24f361274f23357b1a5017ea9304e69338574cf1af6a62a745a467a0",
  "bookmarks/views/custom_css.py": "715e400aab84ac16a79debf5ee25254861f9158c70b7dfe375ee95d036e092e1",
  "bookmarks/views/health.py": "1af075fb09057fc0ec04dd465733a85730455f21739c7975e42f0dc84e8e4521",
  "bookmarks/views/manifest.py": "3446c47afc86cb90f6d6992c5c3e315f83941ef3f58cc924bea1b9932ea0b2fd",
  "bookmarks/views/opensearch.py": "b007a33924c31fe37f0625ed3c0accbec414d35afa3e25199c43d3985ecb1ca4",
  "bookmarks/views/reload.py": "560db362a83d860d58e2c403595f3237d2ff3eaca5353b9459e924e35c4f3129",
  "bookmarks/views/root.py": "1684ee164f386ee7c1335caab30925e78fb2edb9771181930f82bf2aab5f38c6",
  "bookmarks/views/settings.py": "61fc133c0f0650f7d8129f295e10ac970bdc9af25e3c1a2913e8d652c0ccac5c",
  "bookmarks/views/tags.py": "0acc5c7b98ac1020bfd6a566a326bb2b6f3c041d62b1355bd6a988e721d90606",
  "bookmarks/views/toasts.py": "a21d58c66c6e78e357a2db16d19805eecefc5d3a57443469e7e41afc7d256e1c",
  "bookmarks/views/turbo.py": "9a3e417f43025a3e352c1a814ebce44cc36151a177e66b62f1c3e4e7a6f6be8c",
  "bookmarks/widgets.py": "37847314771a434c99e65e338a7b178a8a8c673ac1220dd697f075d92c6a1804",
  "bookmarks/wsgi.py": "5818277a137d8fb3463ff3157ed1bece08c58ce040465954d6eda8e85dc5d62d",
  "bootstrap.sh": "bf0d97844b5a6e9493fe6876b7c4a129ada157423f927107a8964ce18d72e279",
  "docker-compose.yml": "d8f0b8b359100e6721dbdf240cf8fb62afc37bd9c737eaa35fc18c0f58d2785f",
  "docker/alpine.Dockerfile": "5ae078d1f8315483a0fa7e5603add282fcde228363da7f2380d28ac077a68113",
  "docker/default.Dockerfile": "6619fbcead2cd6f230bb4ae913176789d088ae88ad68e5b0108f18862769c8c3",
  "docs/.gitignore": "aed4acb5efe62ec7d514fbdfcdb4227c7904d6c4ad17be6157c4c453cdab9578",
  "docs/README.md": "05d9c1ce5a50457ded924ea1b4d39675fc73f2c153dc83c65ae13b37afe3be0e",
  "docs/astro.config.mjs": "1e37fa142705a1cae71d58fa5adbf29133e95e62f1fd12806df24abdc750b392",
  "docs/package-lock.json": "7dd807202b332ffcd7c6bc97d7253060effcc3b0adf2ca6edcb3bbfd08775365",
  "docs/package.json": "50a5f9bb5806608a3af0900357aec4d54ee47696a60871e06cddf4c5e98266de",
  "docs/public/donations/2023-10-11-internet-archive.png": "c187db8ae5a46c37411308d2b3a3ae2877064e67bbb4674d7ec5b324360b1186",
  "docs/public/donations/2024-10-04-django.png": "a74ddb9d4af5d52b12ceeecc39c764dd2c5e7e4c5cbb323f09e73e8aa0c5e450",
  "docs/public/donations/2024-10-04-internet-archive.png": "24cf23b4f7912861a8a49dcc8bea405211c0680d2e7ac9ccb0a623e532e6963f",
  "docs/public/donations/2024-10-04-noyb.png": "bb2813c177149fa3367dab45f24e05dca7daae90a09bfb2d3181723a27943eb8",
  "docs/public/donations/2024-10-04-singlefile.png": "aba6441303c365826b393a49ba90164254ec7f84b4b763822cac57f4ef17cb64",
  "docs/public/favicon.svg": "2c5a71a01a98ba824065d921ac53f1d16c2cf0184889101ef2e4040ab2d9a477",
  "docs/public/linkding-screenshot-dark.png": "f463dc8ccd42f05b5f9f1f56ede3e850a148df91ed09cca5bcf520dadc415175",
  "docs/public/linkding-screenshot.png": "c31006d71966ac20faa2d24c8b76fc039d29458bbbf97d150841dd0c9d9485cf",
  "docs/src/assets/Add To Linkding.shortcut": "90527c1630a80572c9ce09826da1914fce048b625b503c2cb0c3193a1893363b",
  "docs/src/assets/linkding_shortcut.json": "d28c3c6d26e7d823060465589d91da4f5f0b3e9c32d99c19804a1ad37cfb0c73",
  "docs/src/assets/logo.svg": "63a9cdb3b32edd87e04b2223f8d9c87f23fbae7e4d8f0c95ced1451bd9d59824",
  "docs/src/components/Card.astro": "49c4d6146bea82bac4efc57f21a17e4fb356157a50d26ba81dac029cc7719d97",
  "docs/src/components/icons.ts": "e95087787db150b1961168887a123367db9b37f734a83ea9d8cd31cf6b7b2ab3",
  "docs/src/content.config.ts": "219d8b0c1870d43ba4e59fa712d262acb61e93101a8234ef75224d026c8ccba1",
  "docs/src/content/docs/admin.md": "fe575a4723c4cb4e6539af5535b5954d115009c38cbcb1335a81e962bd2516cb",
  "docs/src/content/docs/api.md": "3f3dff0adfae4f5de3d48550d429981f6ac4f530b66b273c9114ee6efc884def",
  "docs/src/content/docs/archiving.md": "2af860ba8b0e48bc1656111f21caef0b074bf6527b4716dbb30de54d64ff0280",
  "docs/src/content/docs/auto-tagging.md": "ef39bb7ec3e28bfcb429a03784435072284e3e95a63944273d57fe102635d976",
  "docs/src/content/docs/backups.md": "4391f72df840e9c0010ed45de59bef66a15dd20dac3f76a908e509cb6b676051",
  "docs/src/content/docs/browser-extension.md": "433fa0b1c43cb40cdee7c1a01df3592cc8e1f084b70f58948ebded860d4d8eee",
  "docs/src/content/docs/community.md": "fec3b46f51414461113d1e9c0777e432a989bbb13e60636f15239ea1def5ffc7",
  "docs/src/content/docs/how-to.md": "944ec0992be2b2a8c36c02ec6da2ae7a8f2e38e034d77845f4172c9f2f69a8ae",
  "docs/src/content/docs/index.mdx": "9ca755d167c3bfa9b0f284db99160da7297eef32856d7ca2fa97d6a4f9ea117b",
  "docs/src/content/docs/installation.md": "4b1706d4c04e9bbe61c5fd54a54bd48f3c3127a921b8715a79a4de5a8529fbed",
  "docs/src/content/docs/managed-hosting.md": "432bfd5bbfd4fbfe86fbe00afb64ebbfbe4e00148892598f4968ccf49092e72d",
  "docs/src/content/docs/options.md": "fe03a2d2e618babed12013134f5bf69483950dd0f965abae5b628d59e8ca277b",
  "docs/src/content/docs/search.md": "910ee3a5b67f0d7cc47faead6b7faaa3e9ee0ff483260209a257707f48f3c776",
  "docs/src/content/docs/shortcuts.md": "db3d966f2f6cf2ef7484ec6d208bf8e43dcc8f2feba0b84dbb5deb303d056736",
  "docs/src/content/docs/troubleshooting.md": "ea0827423e2cc95548367a8c4b8262cb19942862658f193c2e6cd12a5ba0c5da",
  "docs/src/env.d.ts": "5a498a2ff3c0abb338aff60209dfe32fb591fc5ad359182c5a14910f4c2fff8f",
  "docs/src/styles/custom.css": "cd3cbc04a4207db42c46bb2ece1031cc58b9d203c21543600f243b9fd1761ede",
  "docs/tsconfig.json": "0122b16ad35e3d02899e42e0975168a3bb623c7bafab3275155bf2bf8005e8ae",
  "install-linkding.sh": "21e2ca7209653b9068f875c1cd4644ebf154598626b106f86b96e4410bb15cab",
  "manage.py": "d9f2189769abf31944fd239104e72f489c78c15c53d395afceafefb0b23c881b",
  "package-lock.json": "b0d2825feb8eab5077755e35b8a3b208485e6d50c8c231cfd1c0aef9090bf74b",
  "package.json": "764e56088d5cba014ea409c42427febae94fa6cf55bc70ed9fc949e41d8271e2",
  "pyproject.toml": "fdfcc81710c2f2677dcfc34f8e78433c51f6eb76a00c1461252340a94886173d",
  "pytest.ini": "6856bb43182fd6cb4daeb58f95395a6b9f049d8efd94a30b875527eb55198325",
  "scripts/build-docker.sh": "b800852427cbf4ea24818b73e574ed86d0265b439803a0a286214ad6022d1e7d",
  "scripts/coverage.sh": "0bfce3bbbb49afe7fb3c6661b26f4296d99cd96728542c7c766fb886d35e1a09",
  "scripts/generate-changelog.py": "e302faba6ae814b0e0744629267b798b97da4714e888f5ea87406d22bfde860a",
  "scripts/release.sh": "3b2aefb1e845bc27fcd2763aedfa3fcc1ce37d1a9753916354295f3c1d51d587",
  "scripts/run-docker.sh": "003ac9150257435c82813363d1366aa58b000ee2bdcc160e249b6cff88baf261",
  "scripts/run-postgres.sh": "d4d8de56ff0443365f1ce1d51e07ba567f22a55f4216a98ee271eeb4f64bd3ce",
  "scripts/setup-ublock.sh": "9e904f6abec4e8dd56503c05ecafd607ab3ede35bc08005f6da2f9993cd1b2ee",
  "scripts/test-environments/authelia-oidc/authelia/configuration.yml": "81d128e75f4eba4251bc0825f03e31959cd40fc95a7eb7e4f01266b0d637b77f",
  "scripts/test-environments/authelia-oidc/authelia/users_database.yml": "9ca4ded0b038db3ed08ff35497a39ecc1be8c0edc439b230907d8ca807e3a86a",
  "scripts/test-environments/authelia-oidc/compose.yml": "e2930b8a3c91f224611c7d3faa07ce006b0898f4bd2c8ce02d26b2cafc07f311",
  "scripts/test-environments/authelia-oidc/setup.sh": "e09c8c52a852a58a38afa12539fe2c28dfcd9c2d2dcafad92ef065a062b7d34a",
  "scripts/test-environments/authelia-oidc/traefik/certificates.yml": "d5814b3d1277769fb1885fb05914052ce93d3f274a874890e5014a6cd789c5a5",
  "scripts/test-environments/postgres/compose.yml": "558460bd0ce06faadac786daff3a19ff47b798211be1263e37258244d967b6e8",
  "scripts/test-postgres.sh": "bae56bd3e3b6b3a0fcc4662c1daaf53abe73fd1765f29f36a476b64cec69d9fa",
  "supervisord-all.conf": "8354c677b2a16fefe54367932dc086a9ba0b612b4b765123e05f96b8b61e5eed",
  "supervisord-tasks.conf": "e1802954296831ab0890374eeb70f82c804dc1793fc17a1e7710cdfea73303ee",
  "uv.lock": "1bdc50a68206ac3f4ea8695365226d6cd0661b4e271af89cc610a3d01699c9a4",
  "uwsgi.ini": "a1813e7b857ab6893305ea22f83a414bb62d80eadfc9a40a0725a67aa2c13cac",
  "version.txt": "e1cc6c45ce8e971720bedcb6899d914d837581d3d33793f175bc10db4052bc4b"
});
export const linkdingAssets: Readonly<Record<string,string>> = Object.freeze({
 'bundle.js':'bd4869b67d89d4b8e96861c99a4ba9065b8c3833676b2e492701237dbe0925da',
 'theme-light.css':'f71f25f4ec7f2045d2eb2b90636bf89dd1a146188be88368b3838d1d1d10b676',
 'theme-dark.css':'6b1e714501eccb45d14f769b0c31b64fbbc4c16259150552be66550ed530fa56',
});
export const linkdingTestFiles = ['bookmarks/tests/test_queries.py','bookmarks/tests/test_tags_service.py','bookmarks/tests/test_bookmark_search_model.py','bookmarks/tests/test_bookmark_search_form.py','bookmarks/tests/test_search_query_parser.py','bookmarks/tests/test_tags_model.py'];
export const linkdingCaseIds=['upstream-local-tests','authenticated-original-browser'];
const coverage={scope:'Pinned real linkding 1.47.0: 356 original local-only query/tag/search/model/form assertions and authenticated bookmark-list/search visibility observations on an isolated seeded database.',unknowns:['The 1,380-test upstream full suite is not qualified: external URL tests are excluded, not counted as passed. This profile proves only its fixed local cases, not arbitrary Django applications, paid model quality, production uWSGI, multiworker routing or restart-resumable AE runs.']};
export const linkdingNormalization: BaselineArchive['manifest']['normalization']=[{path:['receipt','rawLog'],reason:'Pytest prints elapsed duration and temporary execution paths. Assertion count, no failures and zero exit are independently checked before this log is normalized.',evidence:'The fixed original six-file pytest invocation emits a terminal 356 passed summary and exits zero; full raw stdout/stderr is retained.',kind:'nondeterministic'}];
function git(root:string,args:string[]):string{return execFileSync('git',['-c','core.hooksPath=/dev/null','-c','core.fsmonitor=false','-C',root,...args],{encoding:'utf8',timeout:15000,maxBuffer:4*1024*1024}).trim();}
export function isLinkdingSourcePath(path:string):boolean{return (path==='docs/src/assets/Add To Linkding.shortcut'||/^[a-zA-Z0-9_.\/-]+$/.test(path))&&!path.startsWith('/')&&!path.split('/').some(p=>p==='..'||p==='.'||p==='');}
function boundedFile(root:string,path:string):Buffer{
 if(!isLinkdingSourcePath(path))throw Error('Unsafe pinned source path');
 let at=root;for(const part of path.split('/')){at=join(at,part);if(lstatSync(at).isSymbolicLink())throw Error('Source symlink denied');}
 const stat=lstatSync(at);if(!stat.isFile()||stat.size>4*1024*1024)throw Error('Source file outside bounded profile');return readFileSync(at);
}
export function matchesLinkdingAssessment(assessment:ProjectAssessment):boolean{
 return assessment.baseCommit===linkdingCommit&&linkdingRecipe.inputs.every(path=>assessment.evidence.find(item=>item.path===path)?.sha256===linkdingHashes[path])&&assessment.evidence.every(item=>linkdingHashes[item.path]===item.sha256);
}
export function inspectLinkding(root:string,candidate=false):Record<string,string>{
 if(realpathSync(root)!==resolve(root)||git(root,['rev-parse','--show-toplevel'])!==root)throw Error('Expected exact real Linkding Git root');
 if(git(root,['rev-parse','HEAD'])!==linkdingCommit)throw Error('Linkding profile requires exact upstream source commit');
 if(git(root,['config','--list']).split('\n').some(line=>/^filter\./i.test(line)))throw Error('Configured Git filters denied');
 const expected=candidate?{...linkdingHashes,...Object.fromEntries(Object.entries(LINKDING_FILES).map(([path,value])=>[path,hash(value)]))}:{...linkdingHashes};
 const entries=git(root,['ls-tree','-rz','--full-tree','HEAD']).split('\0').filter(Boolean);
 if(entries.length!==Object.keys(linkdingHashes).length)throw Error('Unexpected upstream tree entries');
 for(const entry of entries){const match=/^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/.exec(entry);if(!match||!Object.hasOwn(linkdingHashes,match[3]!))throw Error('Unexpected upstream mode/path');}
 const files:Record<string,string>={};for(const [path,expectedHash]of Object.entries(expected)){const bytes=boundedFile(root,path);files[path]=hash(bytes);if(files[path]!==expectedHash)throw Error('Pinned Linkding bytes drift: '+path);}
 // Ignored dependencies/assets are never copied as source. Untracked source outside the recipe is refused.
 const untracked=git(root,['ls-files','--others','--exclude-standard','-z']).split('\0').filter(Boolean);
 if(untracked.some(path=>!candidate||!Object.hasOwn(LINKDING_FILES,path)))throw Error('Unapproved untracked Linkding source');
 return files;
}
export function assertTrustedLinkdingDelivery(input:{sourceRoot:string;candidateRoot:string}){
 const sourceFiles=inspectLinkding(input.sourceRoot),candidateFiles=inspectLinkding(input.candidateRoot,true);
 return {sourceFiles,candidateFiles,sourceTreeHash:treeHash(sourceFiles),candidateTreeHash:treeHash(candidateFiles)};
}
export function linkdingProvenance(codeHash=treeHash(linkdingHashes)):Provenance{
 return {sourceVersion:linkdingCommit,codeHash,environment:'Python 3.13 / Django 6.0.7 locked development dependencies; source-only temporary copy; pinned Chromium sandbox; no model API',environmentHash:hash(JSON.stringify({lock:linkdingHashes['uv.lock'],assets:linkdingAssets,python:'3.13',django:'6.0.7'})),dataHash:hash('linkding-isolated-seed-v1'),schemaVersion:'1',adapterVersion:'trusted-linkding-delivery-v1'};
}
export function linkdingBudget(deadlineAt:number):number{const remaining=deadlineAt-Date.now();if(!Number.isFinite(remaining)||remaining<=0)throw Error('Linkding total verification budget exhausted');return remaining;}
export function linkdingPython(sourceRoot:string,deadlineAt:number):string{
 const interpreter=join(sourceRoot,'.venv/bin/python');if(!existsSync(interpreter)||!lstatSync(join(sourceRoot,'.venv')).isDirectory()||lstatSync(join(sourceRoot,'.venv')).isSymbolicLink())throw Error('Qualified existing Linkding venv required');
 const code='import sys,json,tomllib,importlib.metadata as m; lock=tomllib.load(open(sys.argv[1],"rb")); expected={p["name"]:p["version"] for p in lock["package"] if p["name"] not in ("linkding","uwsgi","psycopg-c","tzdata")}; actual={n:m.version(n) for n in expected}; assert sys.version_info[:2]==(3,13); assert actual==expected,(actual,expected); assert m.version("Django")=="6.0.7"; print(json.dumps({"python":"3.13","django":"6.0.7","locked":True}))';
 const child=spawnSync(interpreter,['-I','-B','-c',code,join(sourceRoot,'uv.lock')],{encoding:'utf8',timeout:Math.min(10000,linkdingBudget(deadlineAt)),maxBuffer:65536,env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8',PYTHONDONTWRITEBYTECODE:'1'}});
 if(child.status!==0||child.signal||child.error)throw Error('Linkding locked Python prerequisite unavailable: '+child.stderr.slice(0,500));
 return interpreter;
}
export function copyLinkdingExecution(root:string,sourceRoot:string,candidate:boolean):{directory:string;files:Record<string,string>}{
 const files=inspectLinkding(root,candidate),directory=mkdtempSync(join(tmpdir(),'ae-linkding-source-'));
 try{for(const path of Object.keys(files)){const target=join(directory,path);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,boundedFile(root,path),{flag:'wx'});}
  for(const [name,expected]of Object.entries(linkdingAssets)){const bytes=boundedFile(sourceRoot,'bookmarks/static/'+name);if(hash(bytes)!==expected)throw Error('Pinned original frontend asset drift: '+name);writeFileSync(join(directory,'bookmarks/static',name),bytes,{flag:'wx'});}
  for(const name of ['assets','favicons','previews'])mkdirSync(join(directory,'data',name),{recursive:true});return {directory,files};
 }catch(error){rmSync(directory,{recursive:true,force:true});throw error;}
}
export interface LinkdingTestResult {exitCode:0;count:number;failed:0;rawLog:string;files:string[];network:'denied';}
export function runLinkdingTests(directory:string,interpreter:string,deadlineAt:number,candidate:false|true|'native'=false):LinkdingTestResult{
 const files=candidate==='native'?['ae_linkding/tests.py']:candidate?[...linkdingTestFiles,'ae_linkding/tests.py']:linkdingTestFiles;
 const script='import os,sys,socket; sys.path.insert(0,sys.argv[1]); os.chdir(sys.argv[1]); os.environ["DJANGO_SETTINGS_MODULE"]="bookmarks.settings.dev"; os.environ["PYTEST_DISABLE_PLUGIN_AUTOLOAD"]="1"\ndef deny(*args,**kwargs): raise RuntimeError("Profile denies outbound network")\nsocket.socket.connect=deny; socket.create_connection=deny\nimport pytest; raise SystemExit(pytest.main(["-q","-p","no:cacheprovider","-p","pytest_django.plugin",*sys.argv[2:]]))';
 const child=spawnSync(interpreter,['-I','-B','-c',script,directory,...files],{encoding:'utf8',timeout:Math.min(100000,linkdingBudget(deadlineAt)),killSignal:'SIGKILL',maxBuffer:1024*1024,env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8',PYTHONDONTWRITEBYTECODE:'1',PYTEST_DISABLE_PLUGIN_AUTOLOAD:'1',AE_ROOT:aeRoot(),AE_PYTHON:interpreter,AE_NODE:process.execPath}});
 const rawLog=child.stdout+'\n'+child.stderr;const counts=[...rawLog.matchAll(/(?:^|\n)(?:=+ )?(\d+) passed(?:, \d+ (?:warnings?|subtests passed))* in /g)];const count=Number(counts.at(-1)?.[1]);
 if(child.error||child.status!==0||child.signal||(!candidate&&count!==356)||(candidate===true&&count!==376)||(candidate==='native'&&count!==20)||/\b(?:FAILED|ERRORS)\b/.test(rawLog))throw Error('Linkding fixed local tests failed: '+rawLog.slice(-4000));
 return {exitCode:0,count,failed:0,rawLog,files,network:'denied'};
}
export const linkdingBrowserAssertions=['original-session-login','own-bookmark-list','host-search-query','foreign-bookmark-invisible'];
export interface LinkdingBrowserResult {phase:'baseline'|'candidate';business:{authenticated:boolean;titles:string[];searchTitles:string[];foreignVisible:boolean};assertions:string[];cleanup:{serverStopped:boolean;browserClosed:boolean};runtime?:unknown;screenshots:Record<string,{base64:string;sha256:string}>;}
export function assertLinkdingBrowser(value:unknown,phase:'baseline'|'candidate'):asserts value is LinkdingBrowserResult{
 const data=value as LinkdingBrowserResult;assert.equal(data.phase,phase);assert.equal(data.business.authenticated,true);assert.equal(data.business.foreignVisible,false);assert.deepEqual([...data.business.titles].sort(),['Django documentation','Python language']);assert.deepEqual(data.business.searchTitles,['Django documentation']);for(const name of linkdingBrowserAssertions)assert.ok(data.assertions.includes(name));assert.deepEqual(data.cleanup,{serverStopped:true,browserClosed:true});const names=phase==='baseline'?['before.png']:['after-collapsed.png','after-approval.png','after.png','after-narrow.png'];assert.deepEqual(Object.keys(data.screenshots).sort(),names.sort());for(const image of Object.values(data.screenshots)){assertLinkdingScreenshot({kind:'pre-apply-original-evidence-reference',...image});}if(Buffer.byteLength(JSON.stringify(data))>900000)throw Error('Linkding browser evidence exceeds artifact byte bound');
}
export async function runLinkdingBrowser(directory:string,interpreter:string,phase:'baseline'|'candidate',output:string,deadlineAt:number):Promise<LinkdingBrowserResult>{
 assertFixtureBrowser(fixtureBrowserPath);
 const collector=join(aeRoot(),'tests/browser/linkding-delivery.mjs');if(!existsSync(collector)||lstatSync(collector).isSymbolicLink())throw Error('Reviewed Linkding browser collector not installed');mkdirSync(output,{recursive:true});
 const timeout=Math.min(120000,linkdingBudget(deadlineAt));
 const child=spawn(process.execPath,[collector,'--source',directory,'--python',interpreter,'--phase',phase,'--output',output,'--deadline',String(deadlineAt)],{detached:true,stdio:['ignore','pipe','pipe'],env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8',AE_ROOT:aeRoot(),AE_PYTHON:interpreter,AE_NODE:process.execPath,PYTHONDONTWRITEBYTECODE:'1'}});
 let outputText='',forced=false,failure:Error|undefined;
 const groupAlive=()=>{if(!child.pid)return false;try{process.kill(-child.pid,0);return true;}catch(error){if((error as NodeJS.ErrnoException).code==='ESRCH')return false;throw error;}};
 const stopGroup=()=>{forced=true;if(child.pid)try{process.kill(-child.pid,'SIGKILL');}catch(error){if((error as NodeJS.ErrnoException).code!=='ESRCH')failure=error instanceof Error?error:Error(String(error));}};
 const outcome=await new Promise<{code:number|null;signal:NodeJS.Signals|null}>(resolveOutcome=>{
  const timer=setTimeout(()=>{failure=Error('Linkding browser collector deadline exceeded');stopGroup();},timeout);
  const collect=(chunk:Buffer)=>{if(Buffer.byteLength(outputText)+chunk.length>1024*1024){failure=Error('Linkding browser collector output exceeded limit');stopGroup();}else outputText+=chunk.toString('utf8');};
  child.stdout.on('data',collect);child.stderr.on('data',collect);
  child.on('error',error=>{failure=error;stopGroup();});
  child.on('close',(code,signal)=>{clearTimeout(timer);resolveOutcome({code,signal});});
 });
 // Normal collector exit is insufficient if a server, runtime child or browser survived it.
 for(let attempt=0;attempt<10&&groupAlive()&&Date.now()<deadlineAt;attempt++)await new Promise(done=>setTimeout(done,25));
 if(groupAlive()){stopGroup();throw Error('Linkding collector left an outstanding process group; forced cleanup, not PASS');}
 if(failure||forced||outcome.code!==0||outcome.signal)throw Error('Linkding browser collector failed: '+(failure?.message??'nonzero exit/signal')+' '+outputText.slice(-4000));
 const result=JSON.parse(readFileSync(join(output,'result.json'),'utf8')) as unknown;assertLinkdingBrowser(result,phase);return result;
}

function testCase(id:string){return {id,input:{suite:id},seed:{fixture:'linkding-isolated-seed-v1'},covers:[id]};}
export function linkdingTestObservation(result:LinkdingTestResult):Observation{return {output:{tests:356,passed:356,failed:0,files:linkdingTestFiles},sideEffects:[],receipt:{exitCode:result.exitCode,rawLog:result.rawLog,network:result.network}};}
/** Immutable pre-apply evidence reference, never a candidate screenshot or business observation. */
export interface LinkdingOriginalScreenshot {kind:'pre-apply-original-evidence-reference';base64:string;sha256:string;}
export function assertLinkdingScreenshot(value:unknown):asserts value is LinkdingOriginalScreenshot{const item=value as LinkdingOriginalScreenshot;assert.deepEqual(Object.keys(item).sort(),['base64','kind','sha256']);assert.equal(item.kind,'pre-apply-original-evidence-reference');assert.equal(typeof item.base64,'string');assert.ok(item.base64.length<700000);const bytes=Buffer.from(item.base64,'base64');assert.equal(bytes.toString('base64'),item.base64);assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(hash(bytes),item.sha256);}
export function linkdingBrowserObservation(result:LinkdingBrowserResult,originalScreenshot:LinkdingOriginalScreenshot):Observation{assertLinkdingScreenshot(originalScreenshot);return {output:result.business,sideEffects:[],receipt:{exitCode:0,rawLog:'browser raw observations retained in output',serverStopped:result.cleanup.serverStopped,browserClosed:result.cleanup.browserClosed,originalScreenshot:{...originalScreenshot}}};}
export function assertLinkdingObservation(id:string,value:Observation):void{
 assert.deepEqual(value.sideEffects,[]);const receipt=value.receipt as Record<string,unknown>;assert.equal(receipt.exitCode,0);assert.equal(typeof receipt.rawLog,'string');
 if(id==='upstream-local-tests'){assert.deepEqual(value.output,{tests:356,passed:356,failed:0,files:linkdingTestFiles});assert.equal(receipt.network,'denied');assert.match(String(receipt.rawLog),/\b356 passed\b/);assert.doesNotMatch(String(receipt.rawLog),/\b(?:FAILED|ERRORS)\b/);}
 else if(id==='authenticated-original-browser'){const business=value.output as LinkdingBrowserResult['business'];assert.deepEqual(business,{authenticated:true,titles:['Django documentation','Python language'],searchTitles:['Django documentation'],foreignVisible:false});assert.equal(receipt.serverStopped,true);assert.equal(receipt.browserClosed,true);assertLinkdingScreenshot(receipt.originalScreenshot);}
 else throw Error('Unknown Linkding baseline case');
}
export async function assertLinkdingBaseline(value:unknown,binding:{sourceRoot?:string;sourceVersion?:string}={}):Promise<BaselineArchive>{
 if(binding.sourceRoot)inspectLinkding(binding.sourceRoot);if(binding.sourceVersion&&binding.sourceVersion!==linkdingCommit)throw Error('Linkding baseline commit mismatch');const archive=verifyArchive(value);if(Buffer.byteLength(JSON.stringify(archive))>900000)throw Error('Linkding baseline exceeds bounded archive allocation');assert.deepEqual(archive.manifest.provenance,linkdingProvenance());assert.equal(archive.manifest.safety,'isolated-seeded-fixture');assert.deepEqual(archive.manifest.normalization,linkdingNormalization);assert.deepEqual(archive.manifest.coverage,coverage);assert.deepEqual(archive.manifest.cases.map(item=>item.test.id),linkdingCaseIds);for(const item of archive.manifest.cases){assert.deepEqual(item.test,testCase(item.test.id));assertLinkdingObservation(item.test.id,item.observation);if(item.test.id==='upstream-local-tests')assert.match(String((item.observation.receipt as Record<string,unknown>).rawLog),/\b356 passed\b/);}return archive;
}
export async function captureLinkdingBaseline(input:{sourceRoot:string;deadlineAt?:number}):Promise<BaselineArchive>{
 inspectLinkding(input.sourceRoot);const deadlineAt=input.deadlineAt??Date.now()+180000,interpreter=linkdingPython(input.sourceRoot,deadlineAt),work=copyLinkdingExecution(input.sourceRoot,input.sourceRoot,false);
 try{
  const tests=runLinkdingTests(work.directory,interpreter,deadlineAt),browser=await runLinkdingBrowser(work.directory,interpreter,'baseline',join(work.directory,'.ae-browser'),deadlineAt);const image=readFileSync(join(work.directory,'.ae-browser/before.png'));const originalScreenshot:LinkdingOriginalScreenshot={kind:'pre-apply-original-evidence-reference',base64:image.toString('base64'),sha256:hash(image)};const observations:Record<string,Observation>={'upstream-local-tests':linkdingTestObservation(tests),'authenticated-original-browser':linkdingBrowserObservation(browser,originalScreenshot)};
  const archive=await captureBaseline({adapter:{safety:'isolated-seeded-fixture',async execute(test){return observations[test.id]!;}},cases:linkdingCaseIds.map(testCase),provenance:linkdingProvenance(),normalization:linkdingNormalization,coverage});return assertLinkdingBaseline(archive,{sourceRoot:input.sourceRoot,sourceVersion:linkdingCommit});
 }finally{rmSync(work.directory,{recursive:true,force:true});}
}
