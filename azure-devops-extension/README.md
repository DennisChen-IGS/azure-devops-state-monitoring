# C4143 DV-Scale Azure DevOps Extension

This extension packages the same live Dashboard core as the Tampermonkey version and adds:

- A full **C4143 DV-Scale** Hub under Azure Test Plans with the same multi-project Query selector as userscript v1.10.0.
- A resizable **C4143 DV-Scale Status** Dashboard Widget.
- Azure DevOps-issued access tokens with read-only `vso.work` and `vso.test` scopes.

## Build and package

```powershell
cd .\azure-devops-extension
npm install
npm run package
```

The installable VSIX is written to:

```text
..\release\C4143-DVScale-Dashboard-Extension.vsix
```

Before publishing to the Visual Studio Marketplace, confirm that `publisher` in `vss-extension.json` matches your Marketplace publisher ID. Keep the extension private while validating it, upload the VSIX, share it with the `azurecsi` organization, install it, then add the widget from **Overview → Dashboards → Add a widget**.
