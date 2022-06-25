
# TS Bundle

Todo doc


### Package.json fields

Good source of info : https://areknawo.com/whats-what-package-json-cheatsheet/

### Roadmap


#### 0.9-beta
👍 Read package.json with tsbundle config
👍 Compile to any module and any target with tsc only
👍 Compile minified targets with gzip report
👍 Output bundled file for browsers
👍 Output several linked files for node and bundlers

#### 1.0-rc 
- Load local tsconfig.json next to package.json which overrides tsbundle defaults
- Load .terserrc and override defaults
- Full documentation
- Example with defaults
- Example with splitted and .min for browser

#### 1.1
- Export report to a txt file, maybe replace automatically README.md with some pattern
- Move and clean dependencies from @solid-js to @zouloux