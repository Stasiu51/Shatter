export class Sheet{
    /**
     * @param {string} name
    */
    constructor(name){
        this.name = name
        this.annotations = /** @type {!Map<!int, !Operation>} */ new Map();
    }
}