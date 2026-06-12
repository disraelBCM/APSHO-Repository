# APSHO Patient Compass Resources

Static GitHub Pages resource browser and lightweight JSON editor for `resources.json`.

## Files

- `index.html` is the public resource browser.
- `admin.html` is the editor used by authorized maintainers.
- `resources.json` is the public data file.
- `app.js` and `styles.css` power both pages.

## Publish to GitHub Pages

1. Create a new GitHub repository.
2. Push this folder to the repository.
3. In GitHub, open **Settings > Pages**.
4. Set the source to the `main` branch and root folder.
5. Open the generated GitHub Pages URL.

## Editor Setup

The editor updates `resources.json` by committing through the GitHub Contents API.

Create a fine-grained GitHub token for each editor:

- Repository access: only this repository
- Permissions: **Contents: Read and write**
- Expiration: as short as practical

Open `admin.html`, enter the repository owner, repository name, branch, JSON path, and token, then choose **Load from GitHub**. After editing resources, choose **Commit to GitHub**.

Do not hard-code a GitHub token into this repository. The editor asks for the token in the browser so the public site never exposes a shared write credential.
