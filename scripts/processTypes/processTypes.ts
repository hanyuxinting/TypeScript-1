import { sys, getDefaultCompilerOptions, createProgram, createCompilerHost } from "./typescript-internal";
import { loadSourceFiles } from "./types";
import { discover, DiscoveryResult } from "./discovery";
import { combinePaths } from "./utilities";

main();

function main() {
    if (sys.args.length < 3) {
        sys.write("Usage:" + sys.newLine)
        sys.write("\tnode processTypes.js <types-ts-input-file> <factory-ts-input-file> <utilities-ts-input-file>" + sys.newLine);
        return;
    }

    const typesTsFileName = sys.resolvePath(sys.args[0]);
    const factoryTsFileName = sys.resolvePath(sys.args[1]);
    const utilitiesTsFileName = sys.resolvePath(sys.args[2]);

    loadSourceFiles([
        /*typesTsFileName*/ sys.resolvePath(sys.args[0]),
        /*factoryTsFileName*/ sys.resolvePath(sys.args[1]),
        /*utilitiesTsFileName*/ sys.resolvePath(sys.args[2])
    ]);

    // Discover syntax nodes
    const discovery = discover();

    // Emit the generated factory output file
    const factoryDirectory = sys.resolvePath(combinePaths(factoryTsFileName, ".."));
    const factoryOutputFile = combinePaths(factoryDirectory, "factory.generated.ts");
    const factoryOutput = generateFactory(discovery);
    sys.writeFile(factoryOutputFile, factoryOutput);
}

export function generateFactory(discovery: DiscoveryResult) {
    return `
// <auto-generated />
/// <reference path="factory.ts" />
namespace ts {${each(discovery.createableNodes, syntaxNode => `
    export function ${syntaxNode.createFunctionName}(${each(syntaxNode.createParameters, member => `${member.parameterName}?: ${member.parameterTypeName}, `)}location?: TextRange, flags?: NodeFlags): ${syntaxNode.typeName} {
        let node = createNode<${syntaxNode.typeName}>(SyntaxKind.${syntaxNode.kindName}, location, flags); ${each(syntaxNode.createParameters, member => `
        if (${member.parameterName}) ${
            member.isModifiersArray
                ? `setModifiers(node, ${member.parameterName});`
                : member.isNodeArray
                    ? `node.${member.propertyName} = createNodeArray(${member.parameterName});`
                    : `node.${member.propertyName} = ${member.parameterName};`
        }`)}
        return node;
    }`)}${each(discovery.updateableNodes, syntaxNode => `
    export function ${syntaxNode.updateFunctionName}(node: ${syntaxNode.typeName}${each(syntaxNode.updateParameters, member => `, ${member.parameterName}: ${member.parameterTypeName}`)}): ${syntaxNode.typeName} {
        if (${each(syntaxNode.updateParameters, member => `${member.parameterName} !== node.${member.propertyName}`, ` || `)}) {
            let newNode = ${syntaxNode.createFunctionName}(${each(syntaxNode.createParameters, member =>
                member.isFactoryParameter
                    ? `node.${member.propertyName}`
                    : member.parameterName, `, `)});
            return updateFrom(node, newNode);
        }
        return node;
    }`)}${each(discovery.testableNodes, syntaxNode => `
    export function ${syntaxNode.testFunctionName}(node: Node): node is ${syntaxNode.typeName} {
        return node && node.kind === SyntaxKind.${syntaxNode.kindName};
    }`)}${each(discovery.testableTypes, syntaxType => `
    export function ${syntaxType.testFunctionName}(node: Node): node is ${syntaxType.typeName} {
        if (node) {
            switch (node.kind) {${each(syntaxType.syntaxNodes, syntaxNode => `
                case SyntaxKind.${syntaxNode.kindName}:`)}
                    return true;
            }
        }
        return false;
    }`)}
    export function cloneNode<TNode extends Node>(node: TNode, location?: TextRange, flags?: NodeFlags): TNode;
    export function cloneNode(node: Node, location?: TextRange, flags: NodeFlags = node.flags): Node {
        if (node) {
            let clone: Node;
            switch (node.kind) {${each(discovery.createableNodes, syntaxNode => `
                case SyntaxKind.${syntaxNode.kindName}:
                    clone = ${syntaxNode.createFunctionName}(${each(syntaxNode.createParameters, member =>
                        `(<${syntaxNode.typeName}>node).${member.propertyName}, `
                    )}location, flags);
                    break;`)}
            }
            if (clone) {
                clone.original = node;
                return clone;
            }
        }
        return node;
    }
    export function acceptTransformer(transformer: Transformer, node: Node, visitor: (node: Node, write: (node: Node) => void) => void): Node {
        if (node) {
            switch (node.kind) {${each(discovery.updateableNodes, syntaxNode => `
                case SyntaxKind.${syntaxNode.kindName}:
                    return ${syntaxNode.updateFunctionName}(<${syntaxNode.typeName}>node${each(syntaxNode.updateParameters, member =>
                        member.visitorFunctionName && member.testFunctionName
                            ? `, ${member.visitorFunctionName}((<${syntaxNode.typeName}>node).${member.propertyName}, visitor, ${member.testFunctionName})`
                            : member.visitorFunctionName
                                ? `, ${member.visitorFunctionName}((<${syntaxNode.typeName}>node).${member.propertyName}, visitor)`
                                : `, (<${syntaxNode.typeName}>node).${member.propertyName}`
                    )});`)}
            }
        }
        return node;
    }
}`;

    function each<T>(items: T[], callbackfn: (item: T) => string, separator = ``) {
        return items.map(callbackfn).join(separator);
    }
}