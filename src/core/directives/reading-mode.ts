// (C) Copyright 2015 Moodle Pty Ltd.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { AfterViewInit, Directive, ElementRef, OnDestroy, inject } from '@angular/core';

import { Translate } from '@singletons';
import { CoreIcons } from '@singletons/icons';
import { CoreDom } from '@singletons/dom';
import { CoreWait } from '@singletons/wait';
import { CoreModals } from '@services/overlays/modals';
import { CoreViewer } from '@features/viewer/services/viewer';
import { CoreDirectivesRegistry } from '@singletons/directives-registry';
import { CoreCollapsibleHeaderDirective } from './collapsible-header';
import { CoreLogger } from '@singletons/logger';

/**
 * Directive to add the reading mode to the selected html tag.
 *
 * Example usage:
 * <div core-reading-mode>
 */
@Directive({
    selector: '[core-reading-mode]',
})
export class CoreReadingModeDirective implements AfterViewInit, OnDestroy {

    protected element: HTMLElement = inject(ElementRef).nativeElement;
    protected viewportPromise = CoreDom.waitToBeInViewport(this.element);
    protected disabledStyles: HTMLStyleElement[] = [];
    protected hiddenElements: HTMLElement[] = [];
    protected renamedStyles: HTMLElement[] = [];
    protected enabled = false;
    protected header?: CoreCollapsibleHeaderDirective;
    protected logger = CoreLogger.getInstance('CoreReadingModeDirective');

    /**
     * @inheritdoc
     */
    async ngAfterViewInit(): Promise<void> {
        await this.viewportPromise;
        await CoreWait.nextTick();
        await this.addTextViewerButton();
        this.element.classList.add('core-reading-mode-ready');

        this.enabled = CoreViewer.isReadingModeEnabledOnEnter();
        CoreViewer.increaseReadingModeCounter();
        if (this.enabled) {
            await this.enterReadingMode();
        }
    }

    /**
     * Add text viewer button to enable the reading mode.
     */
    protected async addTextViewerButton(): Promise<void> {
        const page = CoreDom.closest(this.element, '.ion-page');
        const contentEl = page?.querySelector('ion-content') ?? undefined;

        const header = await CoreDom.findIonHeaderFromElement(this.element);
        const buttonsContainer = header?.querySelector<HTMLIonButtonsElement>('ion-toolbar ion-buttons[slot="end"]');
        if (!buttonsContainer || !contentEl) {
            this.logger.warn('The header was not found, or it didn\'t have any ion-buttons on slot end.');

            return;
        }

        contentEl.classList.add('core-reading-mode-content');

        if (buttonsContainer.querySelector('.core-text-viewer-button')) {

            return;
        }

        const collapsibleHeader = CoreDirectivesRegistry.resolve(header, CoreCollapsibleHeaderDirective);
        if (collapsibleHeader) {
            this.header = collapsibleHeader;
            await this.header.ready();
        }

        const label = Translate.instant('core.viewer.enterreadingmode');
        const button = document.createElement('ion-button');

        button.classList.add('core-text-viewer-button');
        button.setAttribute('aria-label', label);
        button.setAttribute('fill', 'clear');

        const iconName = 'book-open-reader';
        const src = CoreIcons.getIconSrc('font-awesome', 'solid', iconName);
        // Add an ion-icon item to apply the right styles, but the ion-icon component won't be executed.
        button.innerHTML = `<ion-icon name="fas-${iconName}" aria-hidden="true" src="${src}"></ion-icon>`;
        buttonsContainer.prepend(button);

        button.addEventListener('click', (e: Event) => {
            e.preventDefault();
            e.stopPropagation();

            if (!this.enabled) {
                this.enterReadingMode();
            } else {
                this.showReadingSettings();
            }
        });
    }

    /**
     * Enters the reading mode.
     */
    protected async enterReadingMode(): Promise<void> {
        this.enabled = true;
        await CoreViewer.loadReadingModeSettings();

        await this.header?.setEnabled(false);

        document.body.classList.add('core-reading-mode-enabled');
        CoreViewer.setReadingModeEnabledOnEnter(true);

        const elements = document.body.querySelectorAll('[core-reading-mode].core-reading-mode-ready');

        elements.forEach((element: HTMLElement) => {
            // Disable all styles in element.
            const disabledStyles: HTMLStyleElement[] = Array.from(element.querySelectorAll('style:not(disabled)'));
            disabledStyles.forEach((style) => {
                style.disabled = true;
            });

            this.disabledStyles = this.disabledStyles.concat(disabledStyles);

            // Rename style attributes on DOM elements.
            const renamedStyles: HTMLElement[] = Array.from(element.querySelectorAll('*[style]'));
            renamedStyles.forEach((element: HTMLElement) => {
                this.renamedStyles.push(element);
                element.setAttribute('data-original-style', element.getAttribute('style') || '');
                element.removeAttribute('style');
            });

            this.renamedStyles = this.renamedStyles.concat(renamedStyles);

            // Navigate to parent hidding all other elements.
            let currentChild = element;
            let parent = currentChild.parentElement;
            while (parent && parent.tagName.toLowerCase() !== 'ion-content') {
                Array.from(parent.children).forEach((child: HTMLElement) => {
                    if (child !== currentChild && child.tagName.toLowerCase() !== 'swiper-slide') {
                        this.hiddenElements.push(child);
                        child.classList.add('hide-on-reading-mode');
                    }
                });

                currentChild = parent;
                parent = currentChild.parentElement;
            }

            element.classList.remove('core-reading-mode-ready');
        });
    }

    /**
     * Disable the reading mode.
     */
    protected async disableReadingMode(): Promise<void> {
        await this.header?.setEnabled(true);

        this.enabled = false;
        document.body.classList.remove('core-reading-mode-enabled');
        CoreViewer.setReadingModeEnabledOnEnter(false);

        // Enable all styles in element.
        this.disabledStyles.forEach((style) => {
            style.disabled = false;
        });
        this.disabledStyles = [];

        // Rename style attributes on DOM elements.
        this.renamedStyles.forEach((element) => {
            element.setAttribute('style', element.getAttribute('data-original-style') || '');
            element.removeAttribute('data-original-style');
        });
        this.renamedStyles = [];

        this.hiddenElements.forEach((element) => {
            element.classList.remove('hide-on-reading-mode');
        });
        this.hiddenElements = [];

        const elements = document.body.querySelectorAll('[core-reading-mode]');
        elements.forEach((element: HTMLElement) => {
            element.classList.add('core-reading-mode-ready');
        });
    }

    /**
     * Show the reading settings.
     */
    protected async showReadingSettings(): Promise<void> {
        const { CoreReadingModeSettingsModalComponent } =
            await import('@features/viewer/components/reading-mode-settings/reading-mode-settings');

        const exit = await CoreModals.openModal({
            component: CoreReadingModeSettingsModalComponent,
            initialBreakpoint: 1,
            breakpoints: [0, 1],
            cssClass: 'core-modal-auto-height',
        });

        if (exit) {
            this.disableReadingMode();
        }
    }

    /**
     * @inheritdoc
     */
    ngOnDestroy(): void {
        this.viewportPromise.cancel();

        // Disable reading mode should be done by the user.
        CoreViewer.decreaseReadingModeCounter();
        document.body.classList.toggle('core-reading-mode-enabled', CoreViewer.isReadingModeEnabled());
    }

}
