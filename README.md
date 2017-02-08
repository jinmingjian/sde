# Swift Development Environment

[![Build Status](https://travis-ci.org/jinmingjian/sde.svg?branch=master)](https://travis-ci.org/jinmingjian/sde) ![Visual Studio Code Version](https://img.shields.io/badge/Visual%20Studio%20Code-1.9.0-6193DF.svg) ![Swift Version](https://img.shields.io/badge/Swift-3.1.0-orange.svg) [![SwiftPM compatible](https://img.shields.io/badge/SwiftPM-compatible-brightgreen.svg)](https://github.com/apple/swift-package-manager) ![Plaforms](https://img.shields.io/badge/Platform-Linux|macOS-lightgrey.svg) ![License Apache](https://img.shields.io/badge/License-Apache%20v2-lightgrey.svg)

## Project Broadcast
The release 2.0 introduces a new tool [sourcekite](https://github.com/jinmingjian/sourcekite) as the interface to sourcekit library. 

Given the Swift's ABI is not stable, you need to build this tool if you want to use SDE. Go to [sourcekite](https://github.com/jinmingjian/sourcekite) for further instructions.

TIPS: still given the Swift's ABI is not stable, you may find the hover help or code completion do not show right infos as before after you upgrade the Swift toolchain. This is because the SourceKit library you linked with the [sourcekite](https://github.com/jinmingjian/sourcekite) tool can not understand the sources/binaries of your project. Rebuild your project and restart vscode.


If the release broken your current experience or just you do not like to upgrade but accidently do a upgrade, you could do a qucik downgrade like this: 

> 1. download the 1.x vsix from [the release page](https://github.com/jinmingjian/sde/releases)
> 2. remove the installed version in your vscode
> 3. install the local .vsix package in your vscode

History changes can be seen in [CHANGELOG](CHANGELOG.md).

## Quick Preview
![preview](docs/preview.gif)

You can read a [hands-on introduction](http://blog.dirac.io/2017/01/11/get_started_sde.html) for a detail explanation.

## Status
The project focuses on making the below features solid:
* code completion
* formatting
* error diagnostic
* debugging
* navigation/hyperlinking
* hover help
* SPM support/preferences/tools

More the big picture could be seen in [the wiki](https://github.com/jinmingjian/sde/wiki)

The initial goal of this project is to give myself a joyful Swift coding experience in Linux. But with the help of community, the macOS support is equivalent to that of Linux. Hope it could already drive you to start a joyful coding experience for server side Swift at Linux and macOS.(Or you like to try it on Windows 10 WSL)

The current work of project are done in the free time of the author for his love to swift@linux. So, it is best to make limited resources to focus on the most important functionalities. However, always welcome to provide your ideas.  

## Usage
__Installation__

  - Just search "sde" and install from your vscode's Extensions view.

__Prerequisites__

  - This project only depends on its companion project [sourcekite](https://github.com/jinmingjian/sourcekite), which only depends on official Swift and its tool project [SourceKit library](https://github.com/apple/swift/tree/master/tools/SourceKit) transitively. Go to [sourcekite](https://github.com/jinmingjian/sourcekite) for more infos.

  - from release 2.0,  SDE is considering to base on top of swift 3.1 and vscode 1.8 (typescript 2.0 for development). You will be notified when these version dependencies are broken. (NOTE: Swift 3.1 is intended to be source compatible with Swift 3, so you can develop with SDE and release with 3.0)

__*NOTE*__

  0. The dependence to sourcekitd-repl has been be deprecated in/after release 2.0.   

  1. The extension in the marketplace will be rolling-updated in a timed rhythm, such as some weeks. No semantic versioning or backward compatibility guaranteed here. It is better to check the changelog before your update.

 
## Contributors
[Jin Mingjian](mailto:jin.phd@gmail.com): [twitter](https://twitter.com/JinMingjian)

## FAQ

* Why not contribute to the existed projects?

  Current such works are all naive to attract linux/backend users to embrace concise and elegant Swift. I am watching the communities of vscode and Swift to provide the best experience at my best. I also highly suggest the work of community(vscode+SwiftLang) should be joint. But I hope we can be in the right way. 

* How to contribute to this project?

  Any feedback contributes its help.

  If you are saying about contributions to the sources, this is truely another topic. The experience to use an editor is much different to that of developing for an editor. There may be a little more pain than that you think. But if you like to start, welcome! 

  There are not too much documents about developing the project. If you have any question or interest, don't hesitate to file a issue(better than a private email). I will help you, then drop more readings gradually. This is the way of "open source". 

* Why can not debug my executable which built by SPM in my Linux?
   
  Watch [this SR](https://bugs.swift.org/browse/SR-3280) for more and then you would be easy to dig out some workaround although there are still other problems.

* It seems diagnostic infos are only available after building?
  
  Yes. Not only the diagnostic infos, the current design and implementations are convention-based, like SPM itself. This is still far from the perfect. However, it is enough for many cases although not flexible for covering 100%. There are many reasons for this, such as, limited development resources, bugs in Sourcekit tools or the lacks of understanding to current Sourcekit protocol. I'd like to continue to improve the experience.

## [More issues](https://github.com/jinmingjian/sde/issues)

## License
Apache License v2.

## 3rd-party Sources Thanks 
1. [dbgmits](https://github.com/enlight/dbgmits), very nice structure of sources, but of which in my heavy modification to support non-MI and much more
