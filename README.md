# Swift Development Environment

> __Develop your software in its running environment, if you truely eat your own dog food.__ 

<br/>

## Quick Preview
![preview](docs/preview.gif)

You can read a [hands-on introduction](http://blog.dirac.io/2017/01/11/get_started_sde.html) for a detail explanation.

## Goal
I work on Linux to develop my server side stuff too long. But for Swift, there is no satisfactory open source development army knife in Linux.

So the initial goal of this project is to give myself a joyful Swift coding experience in Linux. 

This is no barrier to run the tools under other OSes. However,
* OSX users has the good free Xcode.  
* Windows is not supported officially by Swift itself(particularly interesting in Windows 10 WSL when possible, watch [this issue](https://github.com/Microsoft/BashOnWindows/issues/286)).

## Status
The project focuses on making the below features solid:
* code completion
* formatting
* error diagnostic
* debugging
* navigation/hyperlinking
* hover help
* SPM support/preferences/tools

I hope it could already drive you to start a joyful coding experience for server side Swift at Linux desktop(and maybe osx if you want).

See more road map in [the wiki](https://github.com/jinmingjian/sde/wiki)

The current work of project are done in the free time of the author for his love to swift@linux. So, it is best to make limited resources to focus on the most important functionalities. However, always welcome to provide your ideas on the issues.  

## Usage
Just search "sde" and install from your vscode's Extensions view.

This project only __depends on official Swift project's tools test-side tool sourcekitd-repl__ which [has became available for Linux now](https://bugs.swift.org/browse/SR-1676) by Swift development team. But I consider to make a [a more controllable interface](https://github.com/jinmingjian/sde/issues/9). See [FAQ](#FAQ) to get more infos.

The project is based on the latest dev build of swift (and its tools) and the latest release of vscode/typescript. Because it uses new features as possible to make the developer's life easier. We consider to make the versions of dependencies stable when the dependencies go stable as well.

__*NOTE1*__: Before trying out, __make sure__ you have got sourcekitd-repl(Default to /usr/bin/sourcekitd-repl, but can be configured via "swift.path.sourcekitd_repl") from official buildings, otherwise no functionality available except debugging(it depends on lldb in the exec path...).

*NOTE2:* The extension in the marketplace will be rolling-updated in a timed rhythm, such as one week. No semantic versioning or backward compatibility guaranteed here (in that it makes no senses as mentioned above). It is better to check the changelog before your update.

 
## Insert from the author
To futher embedded into the server side Swift communities, I am proactively pursing a full-time server side Swift job. I am engrossed in the high performance backend in many years, and pround of [my poineer works](http://dirac.io/site_landz/home.html) in the modern Java. If you know related opportunities or if you like to sponsor this project itself, feel free to send me an [email](mailto:jin.phd@gmail.com) or [twitter](https://twitter.com/JinMingjian) DM.

## FAQ
* How to get the sourcekitd-repl executable on my Linux?

  The best way is that you build the tool youself according to the official documents. And before getting sourcekitd-repl, you should frist build sourcekit library(sourcekitdInProc in Linux). There are some pitfalls from my experience. Linux has many distros. The runtime environments vary much. I use Arch which needs to do some patch to enable the tool sides building. Maybe the easier way is to provide the binaies of tools somewhere. But this is a little brittle for different versions of libraries shipped by different distros. If you like to consume in this way and help to provide some feedbacks, open a new issue and I will help you in that. In the meantime, I consider to make a [more controllable interface](https://github.com/jinmingjian/sde/issues/9).    

* Why not contribute to the existed projects?

  Current such works are all naive to attract linux/backend users to embrace concise and elegant Swift. I am watching the communities of vscode and Swift to provide the best experience at my best. I also highly suggest the work of community(vscode+SwiftLang) should be joint. But I hope we can be in the right way. 

* How to contribute to this project?

  Any feedback contributes its help.

  If you are saying about contributions to the sources, this is truely another topic. The experience to use an editor is much different to that of developing for an editor. There may be a little more pain than that you think. But if you like to start, welcome! 

  There are not too much documents about developing the project. If you have any question or interest, don't hesitate to file a issue(better than a private email). I will help you, then drop more readings gradually. This is the way of "open source". 

* Why can not debug my executable which built by SPM in my Linux?
   
  Watch [this SR](https://bugs.swift.org/browse/SR-3280) for more and then you would be easy to dig out some workaround although there are still other problems.

* It seems diagnostic infos are only available after building?
  
  Yes. Not only the diagnostic infos, the current design and implementations are convention-based. This is still far from the perfect. However, it is enough for many cases although not flexible for covering 100%. There are many reasons for this, such as, limited development resources, bugs in Sourcekit tools or the lacks of understanding to current Sourcekit protocol. I'd like to continue to improve the experience.


## License
Apache License v2.

## [More issues](https://github.com/jinmingjian/sde/issues)

## 3rd-party Sources Thanks 
1. [dbgmits](https://github.com/enlight/dbgmits), very nice structure of sources, but of which in my heavy modification to support non-MI and much more
