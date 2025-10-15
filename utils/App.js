// singleton.js
class App {
  constructor() {
    if (App.instance) return App.instance;
    this.store = new Map();
    App.instance = this;
  }

  set(key, value) {
    this.store.set(key, value);
  }

  get(key) {
    return this.store.get(key);
  }

  has(key) {
    return this.store.has(key);
  }

  delete(key) {
    return this.store.delete(key);
  }
}

export default new App();

