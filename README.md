# How to install

```
git clone https://github.com/avast/https-encryption.git
cd extension-https\build
npm install
```

# How to build all extensions

Build using default https-all.json
```
gulp builder
```

# How to build individual extension

```
gulp builder --config 'https-avast.json'
```

Don't pass https.json as config, it's for include only

# Options

- __--silent__ - suppress gulp output (independent of __simple__)
- __--simple__ - outputs only major steps (independent of __silent__)
- __--build_number__ - set build number before building
- __--tag__ - run only tasks with specified tag (clean, build, pack, debug)
- __--nofail__ - ignore network errors (overrides failOnErrors for __download__ commands)

# Workspace structure

- __bin__ - output folder
- __src__ - source code folder
- __diff__ - source original code folder
- __build__ - builder folder
- __build\files__ - configuration files, assets, etc
- __build\keys__ - pem files for CRX (name of extension with .pem) (this has been removed due to security reasons)
- __build\\*.json__ - individual configs
- __build\\*-all.json__ - default config with list of configs to build
- __build\https.json__ - unified config for all extensions
