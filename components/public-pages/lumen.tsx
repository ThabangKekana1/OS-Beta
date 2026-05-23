import React from 'react';
import { SingleSection, CarouselSection, LandingContainer } from '@/components/landing/LandingSections';
import { BUSINESS_REGISTRATION_URL } from '@/lib/links';
import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Lumen | 1OS',
    description: 'Lumen is 1OS’s grid-delivered energy service offering reliable electricity at lower rates through long-term partner agreements.',
    alternates: {
        canonical: '/lumen',
    },
};

export default function LumenPage() {
    return (
        <LandingContainer>
            {/* HERO - Single */}
            <SingleSection
                item={{
                    title: 'Lumen.\nClean Energy. Delivered.',
                    description: 'A solar-powered energy service delivered through a long-term agreement with partners. Reliable electricity at lower rates, powered by the grid, without the need for on-site installations.',
                    link: BUSINESS_REGISTRATION_URL,
                    linkText: 'Get Started',
                    buttonTheme: 'lightPanelGlassWhite',
                    bgColor: '#0b0b0b',
                    textColor: '#ffffff',
                    image: '/lumen-hero-new.jpg'
                }}
            />

            {/* VALUE - Carousel */}
            <CarouselSection
                title="Energy-as-a-Service."
                description="Lumen is a service for buying clean energy, not a solar installation. We leverage the existing power grid to deliver savings directly to your business."
                items={[
                    {
                        tag: '01',
                        title: 'No Installation Required',
                        description: 'No need to own or install solar panels on your premises. We handle the generation off-site and deliver it through the grid.',
                        cardBg: '#ffff80',
                        image: '/lumen-no-installation.jpg'
                    },
                    {
                        tag: '02',
                        title: 'Lower Rates',
                        description: 'Benefit from solar-backed energy rates that are consistently lower than standard grid pricing, reducing your operational costs.',
                        cardBg: '#ffb3ff',
                        image: '/lumen-lower-rates.jpg'
                    },
                    {
                        tag: '03',
                        title: 'Reliable Supply',
                        description: 'Energy is delivered via a partner 58MW power plant through an exclusive 1OS power purchase agreement.',
                        cardBg: '#80d4ff',
                        image: '/lumen-reliable-supply.png'
                    }
                ]}
            />

            {/* FINAL CTA - Single */}
            <SingleSection
                item={{
                    title: 'Switch to Clean, Affordable Energy.',
                    description: 'Join the Lumen network today and start saving on your energy bills with zero equipment footprint.',
                    link: BUSINESS_REGISTRATION_URL,
                    linkText: 'Check Eligibility',
                    buttonTheme: 'lightPanelGlass',
                    bgColor: '#f1f1f1',
                    textColor: '#000000',
                    image: '/lumen-footer.jpg'
                }}
            />
        </LandingContainer>
    );
}
