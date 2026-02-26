import { parseHTML } from 'linkedom';

const { document } = parseHTML('<!DOCTYPE html><html><body></body></html>');

const el = document.createElement('div');
const NodeList = el.childNodes.constructor;
const Element = Object.getPrototypeOf(Object.getPrototypeOf(el)).constructor;
const Node = Object.getPrototypeOf(Element);

globalThis.document = document;
globalThis.Node = Node;
globalThis.Element = Element;
globalThis.NodeList = NodeList;
globalThis.HTMLCollection = NodeList;
globalThis.IntersectionObserver = class {};
