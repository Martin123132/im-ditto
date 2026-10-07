# I’m-Ditto licensing proposal

Historical proposal, approved in direction by the owner on 7 October 2026. The unreleased implementation now has a [file schedule](../../LICENSE), [custom Core licence](../../LICENSES/Im-Ditto-Core-1.0.md), MIT starter and [creator guide](../../CREATOR_RIGHTS.md). Those files, not this proposal, state the current terms. No solicitor review is claimed. The owner subsequently confirmed inclusion of the COO's launcher contribution in the company licensing arrangement; the current Core schedule includes it and the former separate-permission blocker is closed.

The proposal below records the alternatives considered before implementation. A custom, narrowly scoped Core licence was selected instead of changing a standard Shield text or letting competition with an ordinary creator app trigger a restriction. Earlier archives and valid prior grants remain unchanged. The starter notice-copying change is implemented for new builds; old generated workspaces are not altered.

## Original proposal

The recommended split is a protected, source-available Ditto core; a permissively licensed creator starter; independently licensed I’ms; and separate terms for the future I’m-Store. People should be able to build, use, give away and sell their own I’ms without paying Ditto a royalty or seeking individual approval. Copying the protected core into a competing general-purpose platform is a different activity.

Licensing correspondence goes to **Glyn, COO of Two Hands Network Ltd**, at [glyn@twohandsnetwork.co.uk](mailto:glyn@twohandsnetwork.co.uk), not to the developer personally. This is the existing company contact published in [RepoMori’s licensing enquiry form](https://github.com/Martin123132/RepoMori/blob/f7cb897d3ea6abccfedca151a197c949f93bacb3/.github/ISSUE_TEMPLATE/commercial_licensing.yml), selected by the owner for Ditto.

## Proposed boundaries

| Material | Proposed treatment | Boundary |
| --- | --- | --- |
| Host and supporting code in `ditto/`, `src/`, `integrations/pc-bridge/`, `tools/` and host tests | Source-available core terms with a narrowly defined competing-platform restriction | Permit ordinary personal and business use, inspection and internal modifications. A competing distribution based on protected core code requires a separate agreement. Confirm rights in upstream and contributed code first. |
| `creator-template/` | MIT for the designated starter files and their accompanying instructions, after rights clearance | Creators may adapt and distribute these files in free or paid apps, retaining the required notices. This does not put `ditto/` under MIT. |
| Future app-facing interface helpers | Explicitly listed permissive files | Do not label a nonexistent SDK as already licensed. Extract and identify any copyable helpers before applying terms. |
| Example app code in `ims/` and `examples/rehearsal-desk/source/` | Recommend permissive reuse after a separate file-level provenance check | Images, sound, fonts, evidence and third-party code need their own treatment. Rebuild catalogue bundles with matching notices; do not silently relicense old bundles. |
| Creators’ independently supplied code, content and data | Creator-selected terms for rights they hold | Using Ditto does not itself assign their work to the company. Copied starter and third-party material retain their own terms. |
| Product documentation, tutorials and branding | Explicit documentation permissions; separate branding policy | Tutorial assets are not automatically MIT. Permit truthful compatibility descriptions without granting official status or unrestricted logo use. |
| Future store backend, payments and seller services | Separate proprietary service and seller terms | No store backend or commercial seller agreement is established by this proposal. Store participation is optional. |

The proposed MIT starter allows commercial redistribution subject to its notices. That also means competitors can use the permissive starter itself; the protected boundary must be the core, not a hidden restriction on MIT files. [MIT terms](https://opensource.org/license/mit)

## The core licence choice

PolyForm Shield is a candidate, not a ready-to-apply answer. Its competition definition reaches products offered by the licensor and affiliates, and its later-product rule can limit access to newer versions. Applying it unchanged could conflict with creators making apps similar to our examples. [Shield terms](https://polyformproject.org/licenses/shield/1.0.0)

Ask counsel whether Shield with an explicit, controlling creator permission can express the intended boundary, or whether tailored source-available terms are clearer. Do not edit Shield and present the result as the unchanged standard licence. Protection must concern licensed core code, not ownership of every compatible app or marketplace idea.

The intended creator protection must survive the company later entering a creator’s market. A video, game, accessibility or business app should not lose permission merely because we release a similar app. Conversely, calling a repackaged copy of the general-purpose host an “I’m” should not evade valid core restrictions. See the [creator policy draft](CREATOR_PERMISSIONS_DRAFT.md).

A competition-restricted core should be described as source-available, not OSI-approved open source. The permissive starter can be described separately. [Open Source Definition](https://opensource.org/osd)

## Existing rights cannot be ignored

The current root licence offers PolyForm Noncommercial **or** PolyForm Small Business. The latter permits qualifying business use and has no competition exclusion; it is not the proposed anti-cloning protection. [Small Business terms](https://polyformproject.org/licenses/small-business/1.0.0)

Changing future releases must not be presented as revoking existing recipients’ compliant rights. This matters both for private preview recipients and for code inherited from PC Bridge. A new notice cannot be assumed to prevent reuse of an earlier licensed copy. Confirm precisely which future changes the company can license differently.

Copyright protects qualifying expression, not the general idea of an AI app store. Licensing can govern covered code; it cannot guarantee nobody independently builds a competing service. [UK Intellectual Property Office explanation](https://www.gov.uk/government/consultations/artificial-intelligence-and-intellectual-property-call-for-views/artificial-intelligence-call-for-views-copyright-and-related-rights)

## Focused legal review

Review this proposal against source revision `ff3a6dc0a55960e4fc342e06ee44378006fe2796` and resolve these points before activation:

1. **Authority:** confirm the licensing entity, company ownership or sufficient permissions for the core, starter, examples and supplied launcher contribution. Git author metadata alone is not proof of ownership or relicensing permission. Retain third-party notices and check AI-assisted material and applicable provider terms without promising copyright in every output.
2. **Core scope:** define competing general-purpose hosts and services narrowly; protect ordinary creator apps, commercial users and internal customisation. Decide how support services and redistribution of an unmodified official runtime are allowed. Avoid treating every hosted I’m as a competing platform.
3. **Creator certainty:** give explicit commercial creation and distribution permission, with no revenue-size cutoff, mandatory store listing or claim over creator work. Resolve future-version protection and the relationship between any exception and core terms.
4. **Existing grants:** assess earlier PC Bridge and Ditto releases separately. Keep the distinction between new rights grants and unchanged prior licences explicit.
5. **Enforceability and contributions:** review jurisdiction, consumer rights, termination/cure and warranty wording; set a contribution policy that obtains the permissions actually needed for this licensing model. A sign-off is not automatically a copyright assignment.

The deliverable from counsel should be final core terms, a bounded creator grant, the permissive file schedule and a short compatibility/branding policy—not store exclusivity or a claim to creators’ businesses.

## Implementation after approval

The current starter has no dedicated licence file. More importantly, `ditto/creator.mjs` copies an explicit list of seven files into each new I’m. Adding a licence only to the starter directory would not carry it into generated apps. The `pack` route in `ditto/build.mjs` can include such a notice once it is in the production source.

After the owner approves reviewed terms:

1. Install the exact approved core terms and file schedule; align `LICENSE`, `NOTICE`, `COMMERCIAL_LICENSE.md`, `TRADEMARKS.md`, package metadata and contributor guidance. Retain upstream and third-party provenance.
2. Add the approved starter licence and attribution file, copy them through both dashboard and manual creation paths, and explain that creators license their own additions separately. Do not automatically stamp an entire generated app MIT.
3. Test notice preservation through draft creation, packaging, installation, update and portable export. Check example bundles separately. Update the portable build’s explicit file list so the approved terms ship offline.
4. Produce a new reviewed release. Preserve existing immutable releases. Public visibility remains a separate owner decision.

No effective licence or repository visibility is changed by this draft. Existing preview archives do not contain this review pack. The unreleased portable builder now includes it as non-operative review material; it is not a substitute for shipping the eventual approved terms.
