import {UnknownElementException} from '../exceptions';
import {CleanContainer} from './container';
import {InstanceWrapper} from './instance-wrapper';
import {Module} from './module';
import {isFunction} from '../utils';
import {InstanceLink, InstanceToken} from "../contracts";

type HostCollection = 'providers' | 'controllers' | 'injectables' | 'adapters';

export class InstanceLinksHost {
    private readonly instanceLinks = new Map<InstanceToken, InstanceLink[]>();

    constructor(private readonly container: CleanContainer) {
        this.initialize();
    }

    get<T = any>(token: InstanceToken, moduleId?: string): InstanceLink<T> {
        const name = isFunction(token) ? (token as Function).name : (token as string | symbol);
        const modulesMap = this.instanceLinks.get(name);
        if (!modulesMap) throw new UnknownElementException(name);

        const instanceLink = moduleId ? modulesMap.find(item => item.moduleId === moduleId) : modulesMap[modulesMap.length - 1];
        if (!instanceLink) throw new UnknownElementException(name);

        return instanceLink;
    }

    private initialize() {
        const modules = this.container.getModules();
        modules.forEach(moduleRef => {
            const {providers, injectables, controllers, adapters} = moduleRef;
            providers.forEach((wrapper, token) => this.addLink(wrapper, token, moduleRef, 'providers'));
            adapters.forEach((wrapper, token) => this.addLink(wrapper, token, moduleRef, 'adapters'));
            injectables.forEach((wrapper, token) => this.addLink(wrapper, token, moduleRef, 'injectables'));
            controllers.forEach((wrapper, token) => this.addLink(wrapper, token, moduleRef, 'controllers'));
        });
    }

    private addLink(wrapper: InstanceWrapper, token: InstanceToken, moduleRef: Module, collectionName: HostCollection) {
        const instanceLink: InstanceLink = {
            moduleId: moduleRef.id,
            wrapperRef: wrapper,
            collection: moduleRef[collectionName],
            token,
        };
        const existingLinks = this.instanceLinks.get(token);
        if (!existingLinks) this.instanceLinks.set(token, [instanceLink]);
        else existingLinks.push(instanceLink);

    }
}
