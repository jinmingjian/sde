//NOTE: the perfomance of manual parser still crushs that of js-yaml
import yaml = require('js-yaml')

let start = new Date().getTime();
var doc = '';
for (var i = 0; i < 10000; i++) {
    let content = `
    {
      key.kind: source.lang.swift.decl.function.method.instance,
      key.name: "add(:::)",
      key.sourcetext: "add(<#T##method: Method##Method#>, <#T##path: String...##String#>, <#T##value: (Request) throws -> ResponseRepresentable##(Request) throws -> ResponseRepresentable#>)",
      key.description: "add(method: Method, path: String..., value: (Request) throws -> ResponseRepresentable)",
      key.typename: "Void",
      key.doc.brief: "Adds a route using an HTTP method, variadic array of path strings and HTTP closure.",
      key.context: source.codecompletion.context.superclass,
      key.num_bytes_to_erase: ${i},
      key.associated_usrs: "s:Fe11HTTPRoutingRx7Routing12RouteBuilderwx5ValuezP4HTTP9Responder_rS1_3addFTOS3_6MethodGSaSS_FzCS3_7RequestPS3_21ResponseRepresentable__T_",
      key.modulename: "HTTPRouting"
    }
`
    // doc = yaml.safeLoad(content)
    doc = JSON.parse(jsonify(content))
    if (doc['key.num_bytes_to_erase']!=i) {
        throw "something wrong..."
    }
}
console.log('total time cost: ', new Date().getTime() - start + 'ms');


function jsonify(s: string): string {
    return s
        .replace(/(key.[a-z_.]+):/g, '"$1":')
        .replace(/(source.[a-z_.]+),/g, '"$1",')
}