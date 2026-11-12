// Stands in for Phaser when logic modules are run without a browser: any property is another stub class.
const make = () => new Proxy(class {}, { get: (t, k) => (k in t ? t[k] : make()) });
export default make();
