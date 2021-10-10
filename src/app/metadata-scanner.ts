import {iterate} from 'iterare';
import {isConstructor, isFunction, isNil} from "../utils";
import {InjectableInterface} from "../contracts";


export class MetadataScanner {
    public scanFromPrototype<T extends InjectableInterface, R = any>(
        instance: T,
        prototype: object,
        callback: (name: string) => R,
    ): R[] {
        const methodNames = new Set(this.getAllFilteredMethodNames(prototype));
        return iterate(methodNames)
            .map(callback)
            .filter(metadata => !isNil(metadata))
            .toArray();
    }

    * getAllFilteredMethodNames(prototype: object): IterableIterator<string> {

        const isMethod = (prop: string) => {
            const descriptor = Object.getOwnPropertyDescriptor(prototype, prop);
            if (descriptor.set || descriptor.get) return false;
            return !isConstructor(prop) && isFunction(prototype[prop]);
        };

        do {
            yield* iterate(Object.getOwnPropertyNames(prototype))
                .filter(isMethod)
                .toArray();
        } while ((prototype = Reflect.getPrototypeOf(prototype)) && prototype !== Object.prototype);
    }
}
