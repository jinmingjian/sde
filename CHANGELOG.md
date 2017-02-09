Change Log
===

2.0.20170209
---
* make a sourcekite docker image and add a new experimental setting "swift.path.sourcekiteDockerMode" for easier adoption for Linux users (issue: #26) (MacOS users do not need to update to this version in that there is no other additions in this version)

2.0.20170206
---
* release 2.0 ships a Swift language server backend and a new simple, async, pipe driven language server frontend (issue: #9). This new backend solves the unicode problem of original tool sourcekit-repl. This new frontend improves the code logic and the performance which leave the room for future messaging optimization when needed as well. Futhermore, it is not needed to build whole things from Swift's sources any more.

1.0.20170129
---
* serveral fixs for release 1.x and we want to release great new 2.0

1.0.20170118
---

* experimental built-in sourcekit interface (only for macOS)

1.0.20170114
---

* add an config option for shell exec path (issue: #15)

1.0.20170113
---

* fix hard-coded shell exec path for macOS (issue: #14)


1.0.20170112
---

* add container type info in hover (issue: #6)

1.0
---

* Initial public release.