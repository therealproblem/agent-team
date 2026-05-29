import {
  AlertCircle,
  ArrowRight,
  Bell,
  Bold,
  Check,
  ChevronDown,
  ChevronRight,
  Inbox,
  Info,
  Italic,
  Mail,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Terminal,
  Underline,
  User,
} from "lucide-react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { ButtonGroup, ButtonGroupSeparator } from "@/components/ui/button-group";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuShortcut, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "@/components/ui/input-otp";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { Menubar, MenubarContent, MenubarItem, MenubarMenu, MenubarSeparator, MenubarShortcut, MenubarTrigger } from "@/components/ui/menubar";
import { NativeSelect } from "@/components/ui/native-select";
import { NavigationMenu, NavigationMenuContent, NavigationMenuItem, NavigationMenuLink, NavigationMenuList, NavigationMenuTrigger } from "@/components/ui/navigation-menu";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { SonnerDemo } from "@/components/blocks/SonnerDemo";

export const metadata = { title: "Components · agents-team" };

/*
 * Delphi typography utilities. Source Serif 4 lives on headings (>= 24px)
 * with the spec's negative letter-spacing. Inter handles body and UI.
 */
const display = "font-serif font-light text-[64px] leading-[1.05] tracking-[-1.92px]";
const headingLg = "font-serif font-light text-[56px] leading-[1.1] tracking-[-1.23px]";
const heading = "font-serif font-light text-[40px] leading-[1.15] tracking-[-0.8px]";
const headingSm = "font-serif font-normal text-[24px] leading-[1.22] tracking-[-0.48px]";
const subheading = "font-serif font-normal text-[20px] leading-[1.2] tracking-[-0.48px]";
const body = "font-sans text-[15px] leading-[1.4] tracking-[-0.01em]";
const bodyMedium = "font-sans text-[15px] leading-[1.4] tracking-[-0.01em] font-medium";
const caption = "font-sans text-[10px] leading-[1.2] tracking-[0.1em] uppercase font-medium";
const tinyMono = "font-mono text-[13px] leading-[1.4] tracking-normal";

const primaryBtn =
  "h-11 px-4 rounded-[12px] bg-burnt-umber hover:bg-deep-cognac text-white font-sans font-medium text-[15px] shadow-none";
const secondaryBtn =
  "h-11 px-4 rounded-[12px] bg-transparent border border-muted-stone text-deep-cognac hover:bg-cloud-fog hover:border-deep-cognac font-sans font-normal text-[15px] shadow-none";
const tertiaryBtn =
  "h-11 px-4 rounded-[12px] bg-cloud-fog hover:bg-cloud-fog/70 text-deep-cognac font-sans font-normal text-[15px] border-0 shadow-none";

const PALETTE: { name: string; role: string; token: string; light: string; dark: string }[] = [
  { name: "Parchment White", role: "page bg",         token: "--color-parchment-white", light: "#fdf6ee", dark: "#0d0805" },
  { name: "Deep Cognac",     role: "primary text",    token: "--color-deep-cognac",     light: "#2b180a", dark: "#f0e6dc" },
  { name: "Burnt Umber",     role: "primary CTA",     token: "--color-burnt-umber",     light: "#3e2407", dark: "#f0e6dc" },
  { name: "Cloud Fog",       role: "secondary surface", token: "--color-cloud-fog",     light: "#f0e6dc", dark: "#251910" },
  { name: "Pressed Cacao",   role: "tertiary text",   token: "--color-pressed-cacao",   light: "#7f6e60", dark: "#d8ccbe" },
  { name: "Muted Stone",     role: "muted text",      token: "--color-muted-stone",     light: "#94877c", dark: "#a99d93" },
  { name: "Warm Ash",        role: "subtle border",   token: "--color-warm-ash",        light: "#a99d93", dark: "#948880" },
  { name: "Dark Charcoal",   role: "alt deep text",   token: "--color-dark-charcoal",   light: "#21201c", dark: "#f0e6dc" },
  { name: "Fire Opal",       role: "destructive",     token: "--color-fire-opal",       light: "#f65726", dark: "#f65726" },
  { name: "Sunset Orange",   role: "warning accent",  token: "--color-sunset-orange",   light: "#ff5c00", dark: "#ff5c00" },
  { name: "White",           role: "anchor surface",  token: "--color-white",           light: "#ffffff", dark: "#0d0805" },
];

const TYPE_SCALE: { role: string; size: string; cls: string }[] = [
  { role: "display", size: "64px", cls: display },
  { role: "heading-lg", size: "56px", cls: headingLg },
  { role: "heading", size: "40px", cls: heading },
  { role: "heading-sm", size: "24px", cls: headingSm },
  { role: "subheading", size: "20px", cls: subheading },
  { role: "body", size: "15px", cls: body },
  { role: "caption", size: "10px", cls: caption },
];

function SectionHeader({ num, kicker, title, lede }: { num: string; kicker: string; title: string; lede?: string }) {
  return (
    <header className="space-y-2">
      <p className={`${caption} text-pressed-cacao`}>{num} · {kicker}</p>
      <h2 className={heading}>{title}</h2>
      {lede ? <p className={`${body} text-muted-stone max-w-2xl`}>{lede}</p> : null}
    </header>
  );
}

export default function ComponentsPage() {
  return (
    <main className="bg-background min-h-screen">
      <div className="mx-auto max-w-[1200px] px-6 md:px-10 py-20 space-y-[75px]">

        {/* Hero — clean, no CTAs */}
        <section className="space-y-8 pt-12 pb-6 text-center">
          <p className={`${caption} text-pressed-cacao`}>The Component Kit · v1</p>
          <h1 className={display}>Delphi</h1>
          <p className="font-sans text-[17px] leading-[1.4] tracking-[-0.01em] text-muted-stone max-w-2xl mx-auto">
            A leather-bound journal of UI. Quiet authority on warm parchment, with
            Source Serif at whisper-weights for deep contemplation and Inter sans
            for crisp, contemporary body copy.
          </p>
        </section>

        <Separator className="bg-muted-stone/30" />

        {/* 01 Typography */}
        <section className="space-y-8">
          <SectionHeader num="01" kicker="Typography" title="Type scale" lede="Source Serif 4 stands in for Martina Plantijn Light — whisper-weight 300 for display, 400 for paragraphs at headline sizes. Inter handles body and UI." />
          <div className="rounded-[20px] bg-cloud-fog p-8 space-y-6">
            {TYPE_SCALE.map((t) => (
              <div key={t.role} className="grid grid-cols-[112px_1fr] items-baseline gap-6">
                <code className="font-mono text-[10px] tracking-[0.1em] uppercase text-pressed-cacao pt-2">
                  {t.role} · {t.size}
                </code>
                <p className={t.cls}>The quick brown fox jumps over the lazy dog.</p>
              </div>
            ))}
          </div>
        </section>

        {/* 02 Palette */}
        <section className="space-y-8">
          <SectionHeader num="02" kicker="Palette" title="Colors" lede="A nuanced palette of warm grays and subtle browns. Tokens have stable roles across themes — only the pigment swaps. Reserve Fire Opal and Sunset Orange for impactful accents only." />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {PALETTE.map((c) => (
              <div key={c.token} className="rounded-[16px] bg-card border border-border p-4 space-y-3">
                {/* Swatch reads the live CSS var so it follows the active theme. */}
                <div
                  className="h-24 rounded-[12px] border border-border"
                  style={{ background: `var(${c.token})` }}
                />
                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className={`${bodyMedium} text-deep-cognac`}>{c.name}</p>
                    <p className="font-sans text-[10px] tracking-[0.1em] uppercase font-medium text-muted-stone">{c.role}</p>
                  </div>
                  <div className="flex flex-col gap-0.5 font-mono text-[11px]">
                    <span className="text-pressed-cacao">
                      <span className="text-muted-stone">L</span> {c.light}
                    </span>
                    <span className="text-pressed-cacao">
                      <span className="text-muted-stone">D</span> {c.dark}
                    </span>
                  </div>
                  <p className="font-mono text-[10px] tracking-[0.05em] text-muted-stone uppercase">{c.token}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 03 Buttons */}
        <section className="space-y-8">
          <SectionHeader num="03" kicker="Buttons" title="Buttons, toggles, groups" lede="All buttons share a 12px corner radius and 12px×16px padding. Toggles and ButtonGroups inherit the same scale." />
          <div className="rounded-[20px] bg-card border border-border p-6 space-y-6">
            <div className="flex flex-wrap gap-3 items-center">
              <Button className={primaryBtn}>Primary</Button>
              <Button variant="outline" className={secondaryBtn}>Secondary</Button>
              <Button variant="secondary" className={tertiaryBtn}>Tertiary</Button>
              <Button className="h-11 px-4 rounded-[12px] bg-white hover:bg-cloud-fog text-deep-cognac font-normal text-[15px] shadow-none border border-border">Auth</Button>
              <Button variant="destructive" className="h-11 px-4 rounded-[12px] bg-fire-opal hover:bg-sunset-orange text-white font-medium text-[15px] shadow-none">Destructive</Button>
              <Button variant="link" className="text-[15px] text-deep-cognac underline-offset-4">Inline link</Button>
            </div>
            <Separator className="bg-muted-stone/20" />
            <div className="flex flex-wrap gap-3 items-center">
              <Button size="sm" className="h-9 px-3 rounded-[10px] bg-burnt-umber hover:bg-deep-cognac text-white font-medium text-[13px] shadow-none">Small</Button>
              <Button className={primaryBtn}>Default</Button>
              <Button size="lg" className="h-12 px-5 rounded-[12px] bg-burnt-umber hover:bg-deep-cognac text-white font-medium text-[15px] shadow-none">Large</Button>
              <Button size="icon" className="h-11 w-11 rounded-[12px] bg-burnt-umber hover:bg-deep-cognac text-white shadow-none" aria-label="Settings">
                <Settings className="size-5" strokeWidth={1.5} />
              </Button>
              <Button disabled className="h-11 px-4 rounded-[12px] bg-burnt-umber text-white font-medium text-[15px] shadow-none opacity-50">Disabled</Button>
            </div>
            <Separator className="bg-muted-stone/20" />
            <div className="flex flex-wrap gap-6 items-center">
              <div className="space-y-2">
                <p className={`${caption} text-pressed-cacao`}>Toggle</p>
                <div className="flex gap-2">
                  <Toggle aria-label="Bold" className="rounded-[10px] data-[state=on]:bg-cloud-fog data-[state=on]:text-deep-cognac"><Bold className="size-4" strokeWidth={1.75} /></Toggle>
                  <Toggle aria-label="Italic" className="rounded-[10px] data-[state=on]:bg-cloud-fog data-[state=on]:text-deep-cognac"><Italic className="size-4" strokeWidth={1.75} /></Toggle>
                  <Toggle aria-label="Underline" defaultPressed className="rounded-[10px] data-[state=on]:bg-cloud-fog data-[state=on]:text-deep-cognac"><Underline className="size-4" strokeWidth={1.75} /></Toggle>
                </div>
              </div>
              <div className="space-y-2">
                <p className={`${caption} text-pressed-cacao`}>ToggleGroup</p>
                <ToggleGroup type="single" defaultValue="left" className="border border-border rounded-[12px] overflow-hidden">
                  <ToggleGroupItem value="left" className="rounded-none data-[state=on]:bg-cloud-fog data-[state=on]:text-deep-cognac px-4">Left</ToggleGroupItem>
                  <ToggleGroupItem value="center" className="rounded-none data-[state=on]:bg-cloud-fog data-[state=on]:text-deep-cognac px-4">Center</ToggleGroupItem>
                  <ToggleGroupItem value="right" className="rounded-none data-[state=on]:bg-cloud-fog data-[state=on]:text-deep-cognac px-4">Right</ToggleGroupItem>
                </ToggleGroup>
              </div>
              <div className="space-y-2">
                <p className={`${caption} text-pressed-cacao`}>ButtonGroup</p>
                <ButtonGroup>
                  <Button variant="outline" className={`${secondaryBtn} rounded-r-none`}>Previous</Button>
                  <ButtonGroupSeparator />
                  <Button variant="outline" className={`${secondaryBtn} rounded-none border-l-0`}>Today</Button>
                  <ButtonGroupSeparator />
                  <Button variant="outline" className={`${secondaryBtn} rounded-l-none border-l-0`}>Next</Button>
                </ButtonGroup>
              </div>
            </div>
          </div>
        </section>

        {/* 04 Tags */}
        <section className="space-y-8">
          <SectionHeader num="04" kicker="Tags" title="Tags & badges" lede="Small rectangles, 8px radius. Inter 13px medium with restrained tracking — never uppercase, never bold." />
          <div className="rounded-[20px] bg-card border border-border p-6 space-y-4">
            <div className="flex flex-wrap gap-2 items-center">
              <Badge className="rounded-[8px] px-2.5 py-1 text-[13px] font-medium bg-burnt-umber text-white border-0 shadow-none">Default</Badge>
              <Badge className="rounded-[8px] px-2.5 py-1 text-[13px] font-medium bg-cloud-fog text-deep-cognac border-0 shadow-none">Secondary</Badge>
              <Badge variant="outline" className="rounded-[8px] px-2.5 py-1 text-[13px] font-medium border-muted-stone text-deep-cognac">Outline</Badge>
              <Badge className="rounded-[8px] px-2.5 py-1 text-[13px] font-medium bg-fire-opal text-white border-0 shadow-none">Destructive</Badge>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <span className="inline-flex items-center gap-1.5 rounded-[8px] border border-muted-stone px-2.5 py-1 text-[13px] text-pressed-cacao">
                <Check className="size-3.5" strokeWidth={1.75} /> Active
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-[8px] bg-cloud-fog px-2.5 py-1 text-[13px] text-pressed-cacao">
                <span className="size-1.5 rounded-full bg-pressed-cacao" /> Pending
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-[8px] bg-cloud-fog px-2.5 py-1 text-[13px] text-fire-opal">
                <span className="size-1.5 rounded-full bg-fire-opal" /> Notification
              </span>
            </div>
          </div>
        </section>

        {/* 05 Cards */}
        <section className="space-y-8">
          <SectionHeader num="05" kicker="Cards" title="Cards" lede="16–20px radius, 20px padding. Cards sit on the same Parchment background; an almost-invisible shadow does the lifting. Avatars in testimonial cards go all the way to 70px radius — a Delphi signature." />
          <div className="grid md:grid-cols-2 gap-5">
            <Card className="rounded-[16px] bg-card border border-border shadow-[0_1px_2px_rgba(43,24,10,0.05)] p-0">
              <CardHeader className="space-y-2 p-5">
                <CardTitle className={`${headingSm} text-deep-cognac`}>Never repeat yourself</CardTitle>
                <CardDescription className={`${body} text-muted-stone`}>
                  You have expertise people want. Delphi turns it into an interactive
                  profile that answers — in your voice — while you sleep.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-5 pb-5 space-y-3">
                <ul className="space-y-2">
                  <li className={`flex items-start gap-2 ${body} text-deep-cognac`}><Check className="size-4 mt-0.5 shrink-0 text-burnt-umber" strokeWidth={1.75} />Ingest writing, talks, and journal notes</li>
                  <li className={`flex items-start gap-2 ${body} text-deep-cognac`}><Check className="size-4 mt-0.5 shrink-0 text-burnt-umber" strokeWidth={1.75} />Train a private persona on your corpus</li>
                  <li className={`flex items-start gap-2 ${body} text-deep-cognac`}><Check className="size-4 mt-0.5 shrink-0 text-burnt-umber" strokeWidth={1.75} />Share a link, not a deck</li>
                </ul>
              </CardContent>
              <CardFooter className="px-5 pb-5">
                <Button className={primaryBtn}>Create your digital mind</Button>
              </CardFooter>
            </Card>
            <Card className="rounded-[20px] bg-card border border-border shadow-[0_1px_2px_rgba(43,24,10,0.05)] p-0">
              <CardContent className="p-5 space-y-4">
                <p className={`${body} text-deep-cognac leading-[1.55]`}>
                  &ldquo;The first AI tool I&apos;ve used that actually sounds like me.
                  My readers can ask follow-ups at 2am, and the answers don&apos;t
                  embarrass me the next morning.&rdquo;
                </p>
                <div className="flex items-center gap-3 pt-2">
                  <Avatar className="size-12 rounded-[70px]">
                    <AvatarImage src="https://github.com/shadcn.png" alt="" className="rounded-[70px]" />
                    <AvatarFallback className="bg-cloud-fog text-deep-cognac rounded-[70px]">EB</AvatarFallback>
                  </Avatar>
                  <div className="space-y-0.5">
                    <p className={`${bodyMedium} text-deep-cognac`}>Eleanor Bryce</p>
                    <p className={`${body} text-muted-stone`}>Cognitive scientist · author</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* 06 Form inputs */}
        <section className="space-y-8">
          <SectionHeader num="06" kicker="Form inputs" title="Inputs & controls" />
          <div className="grid md:grid-cols-2 gap-5">
            <div className="rounded-[20px] bg-card border border-border p-6 space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="email-input" className={`${body} font-medium text-deep-cognac`}>Email</Label>
                <Input id="email-input" type="email" placeholder="you@example.com" className="h-11 px-4 rounded-[12px] bg-parchment-white border-muted-stone text-deep-cognac placeholder:text-muted-stone text-[15px] focus-visible:ring-1 focus-visible:ring-deep-cognac focus-visible:border-deep-cognac" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="textarea-input" className={`${body} font-medium text-deep-cognac`}>Message</Label>
                <Textarea id="textarea-input" placeholder="What's on your mind?" className="rounded-[12px] bg-parchment-white border-muted-stone text-deep-cognac placeholder:text-muted-stone text-[15px] p-4 min-h-[120px]" />
              </div>
              <div className="space-y-1.5">
                <Label className={`${body} font-medium text-deep-cognac`}>Region (Radix Select)</Label>
                <Select>
                  <SelectTrigger className="h-11 px-4 rounded-[12px] bg-parchment-white border-muted-stone text-[15px]"><SelectValue placeholder="Select a region" /></SelectTrigger>
                  <SelectContent className="rounded-[12px] border-border bg-card">
                    <SelectItem value="us" className="text-[15px]">United States</SelectItem>
                    <SelectItem value="eu" className="text-[15px]">European Union</SelectItem>
                    <SelectItem value="apac" className="text-[15px]">Asia Pacific</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="native-region" className={`${body} font-medium text-deep-cognac`}>Region (NativeSelect)</Label>
                <NativeSelect id="native-region" defaultValue="us" className="h-11 px-4 rounded-[12px] bg-parchment-white border-muted-stone text-[15px]">
                  <option value="us">United States</option>
                  <option value="eu">European Union</option>
                  <option value="apac">Asia Pacific</option>
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label className={`${body} font-medium text-deep-cognac`}>InputGroup — search</Label>
                <InputGroup className="rounded-[12px] bg-parchment-white border-muted-stone h-11">
                  <InputGroupAddon><Search className="size-4 text-muted-stone" strokeWidth={1.75} /></InputGroupAddon>
                  <InputGroupInput placeholder="Search the briefing…" className="text-[15px] placeholder:text-muted-stone" />
                </InputGroup>
              </div>
              <div className="space-y-1.5">
                <Label className={`${body} font-medium text-deep-cognac`}>InputOTP — 6 digits</Label>
                <InputOTP maxLength={6}>
                  <InputOTPGroup>
                    <InputOTPSlot index={0} className="rounded-l-[10px] border-muted-stone bg-parchment-white text-[15px] size-11" />
                    <InputOTPSlot index={1} className="border-muted-stone bg-parchment-white text-[15px] size-11" />
                    <InputOTPSlot index={2} className="rounded-r-[10px] border-muted-stone bg-parchment-white text-[15px] size-11" />
                  </InputOTPGroup>
                  <InputOTPSeparator />
                  <InputOTPGroup>
                    <InputOTPSlot index={3} className="rounded-l-[10px] border-muted-stone bg-parchment-white text-[15px] size-11" />
                    <InputOTPSlot index={4} className="border-muted-stone bg-parchment-white text-[15px] size-11" />
                    <InputOTPSlot index={5} className="rounded-r-[10px] border-muted-stone bg-parchment-white text-[15px] size-11" />
                  </InputOTPGroup>
                </InputOTP>
              </div>
            </div>
            <div className="rounded-[20px] bg-card border border-border p-6 space-y-6">
              <div className="space-y-2">
                <Label className={`${body} font-medium text-deep-cognac`}>Checkbox</Label>
                <div className="flex items-center gap-2.5">
                  <Checkbox id="terms" className="rounded-[4px] border-muted-stone data-[state=checked]:bg-burnt-umber data-[state=checked]:border-burnt-umber" />
                  <label htmlFor="terms" className={`${body} text-deep-cognac`}>Accept the terms of service</label>
                </div>
              </div>
              <div className="space-y-2">
                <Label className={`${body} font-medium text-deep-cognac`}>Radio group</Label>
                <RadioGroup defaultValue="standard" className="space-y-1.5">
                  <div className="flex items-center gap-2.5">
                    <RadioGroupItem value="standard" id="r1" className="border-muted-stone text-burnt-umber" />
                    <Label htmlFor="r1" className={`${body} text-deep-cognac`}>Standard delivery</Label>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <RadioGroupItem value="express" id="r2" className="border-muted-stone text-burnt-umber" />
                    <Label htmlFor="r2" className={`${body} text-deep-cognac`}>Express delivery</Label>
                  </div>
                </RadioGroup>
              </div>
              <div className="space-y-2">
                <Label className={`${body} font-medium text-deep-cognac`}>Switch</Label>
                <div className="flex items-center gap-2.5">
                  <Switch id="airplane" defaultChecked className="data-[state=checked]:bg-burnt-umber" />
                  <Label htmlFor="airplane" className={`${body} text-deep-cognac`}>Airplane mode</Label>
                </div>
              </div>
              <div className="space-y-2">
                <Label className={`${body} font-medium text-deep-cognac`}>Slider</Label>
                <Slider defaultValue={[40]} max={100} step={1} />
              </div>
              <div className="space-y-2">
                <Label className={`${body} font-medium text-deep-cognac`}>Progress</Label>
                <Progress value={62} className="bg-cloud-fog [&>*]:bg-burnt-umber h-2" />
              </div>
            </div>
          </div>
        </section>

        {/* 07 Alerts + Sonner */}
        <section className="space-y-8">
          <SectionHeader num="07" kicker="Alerts" title="Alerts & toasts" />
          <div className="space-y-3">
            <Alert className="rounded-[16px] bg-card border border-border p-5 gap-3 [&>svg]:size-5 [&>svg]:top-5 [&>svg]:left-5 [&>svg]:text-burnt-umber shadow-none">
              <Terminal strokeWidth={1.5} />
              <AlertTitle className={`${bodyMedium} text-deep-cognac mb-1`}>Heads up</AlertTitle>
              <AlertDescription className={`${body} text-muted-stone`}>You can add components to your app using the CLI.</AlertDescription>
            </Alert>
            <Alert className="rounded-[16px] bg-cloud-fog border-0 p-5 gap-3 [&>svg]:size-5 [&>svg]:top-5 [&>svg]:left-5 [&>svg]:text-burnt-umber shadow-none">
              <Info strokeWidth={1.5} />
              <AlertTitle className={`${bodyMedium} text-deep-cognac mb-1`}>Note</AlertTitle>
              <AlertDescription className={`${body} text-pressed-cacao`}>Cloud Fog works well for soft, informational notifications.</AlertDescription>
            </Alert>
            <Alert variant="destructive" className="rounded-[16px] bg-card border border-fire-opal/40 p-5 gap-3 [&>svg]:size-5 [&>svg]:top-5 [&>svg]:left-5 [&>svg]:text-fire-opal shadow-none">
              <AlertCircle strokeWidth={1.5} />
              <AlertTitle className={`${bodyMedium} text-fire-opal mb-1`}>Session expired</AlertTitle>
              <AlertDescription className={`${body} text-pressed-cacao`}>Please sign in again to continue.</AlertDescription>
            </Alert>
          </div>
          <div className="rounded-[20px] bg-card border border-border p-6 space-y-3">
            <p className={`${caption} text-pressed-cacao`}>Sonner — transient toasts</p>
            <SonnerDemo />
          </div>
        </section>

        {/* 08 Loading + Empty */}
        <section className="space-y-8">
          <SectionHeader num="08" kicker="Loading" title="Loading & empty states" />
          <div className="grid md:grid-cols-2 gap-5">
            <div className="rounded-[20px] bg-card border border-border p-6 space-y-6">
              <div className="space-y-2">
                <Label className={`${body} font-medium text-deep-cognac`}>Spinner</Label>
                <div className="flex gap-6 items-center text-burnt-umber">
                  <Spinner className="size-4" />
                  <Spinner className="size-5" />
                  <Spinner className="size-7" />
                </div>
              </div>
              <Separator className="bg-muted-stone/20" />
              <div className="space-y-2">
                <Label className={`${body} font-medium text-deep-cognac`}>Skeleton</Label>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-[320px] rounded-[6px] bg-cloud-fog" />
                  <Skeleton className="h-4 w-[260px] rounded-[6px] bg-cloud-fog" />
                  <Skeleton className="h-4 w-[200px] rounded-[6px] bg-cloud-fog" />
                </div>
              </div>
            </div>
            <div className="rounded-[20px] bg-card border border-border p-6">
              <Empty className="border-0 p-0">
                <EmptyHeader>
                  <EmptyMedia variant="icon" className="rounded-[12px] bg-cloud-fog text-burnt-umber">
                    <Inbox className="size-5" strokeWidth={1.5} />
                  </EmptyMedia>
                  <EmptyTitle className={`${headingSm} text-deep-cognac`}>No items in the briefing</EmptyTitle>
                  <EmptyDescription className={`${body} text-muted-stone`}>
                    Run a refresh from the news page or wait for the morning cron.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button className={primaryBtn}>
                    <RefreshCw className="size-4" strokeWidth={1.75} /> Refresh now
                  </Button>
                </EmptyContent>
              </Empty>
            </div>
          </div>
        </section>

        {/* 09 Data: Table + Pagination */}
        <section className="space-y-8">
          <SectionHeader num="09" kicker="Data" title="Table & pagination" />
          <div className="rounded-[16px] bg-card border border-border overflow-hidden">
            <Table>
              <TableHeader className="bg-primary [&_tr]:border-0">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-auto px-5 py-4 text-left font-medium uppercase tracking-[0.1em] text-[10px] text-primary-foreground whitespace-normal">Invoice</TableHead>
                  <TableHead className="h-auto px-5 py-4 text-left font-medium uppercase tracking-[0.1em] text-[10px] text-primary-foreground whitespace-normal">Status</TableHead>
                  <TableHead className="h-auto px-5 py-4 text-right font-medium uppercase tracking-[0.1em] text-[10px] text-primary-foreground whitespace-normal">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="border-border hover:bg-cloud-fog/40 transition-colors">
                  <TableCell className={`${body} font-medium px-5 py-4 text-deep-cognac`}>INV-001</TableCell>
                  <TableCell className="px-5 py-4"><Badge className="rounded-[8px] px-2.5 py-1 text-[13px] font-medium bg-cloud-fog text-deep-cognac border-0 shadow-none">Paid</Badge></TableCell>
                  <TableCell className={`${tinyMono} px-5 py-4 text-right text-deep-cognac`}>$250.00</TableCell>
                </TableRow>
                <TableRow className="border-border hover:bg-cloud-fog/40 transition-colors">
                  <TableCell className={`${body} font-medium px-5 py-4 text-deep-cognac`}>INV-002</TableCell>
                  <TableCell className="px-5 py-4"><Badge variant="outline" className="rounded-[8px] px-2.5 py-1 text-[13px] font-medium border-muted-stone text-pressed-cacao">Pending</Badge></TableCell>
                  <TableCell className={`${tinyMono} px-5 py-4 text-right text-deep-cognac`}>$150.00</TableCell>
                </TableRow>
                <TableRow className="hover:bg-cloud-fog/40 transition-colors">
                  <TableCell className={`${body} font-medium px-5 py-4 text-deep-cognac`}>INV-003</TableCell>
                  <TableCell className="px-5 py-4"><Badge className="rounded-[8px] px-2.5 py-1 text-[13px] font-medium bg-burnt-umber text-white border-0 shadow-none">Paid</Badge></TableCell>
                  <TableCell className={`${tinyMono} px-5 py-4 text-right text-deep-cognac`}>$350.00</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
          <div className="rounded-[16px] bg-card border border-border p-5">
            <Pagination>
              <PaginationContent>
                <PaginationItem><PaginationPrevious href="#" className="rounded-[10px] hover:bg-cloud-fog hover:text-deep-cognac" /></PaginationItem>
                <PaginationItem><PaginationLink href="#" className="rounded-[10px] hover:bg-cloud-fog hover:text-deep-cognac">1</PaginationLink></PaginationItem>
                <PaginationItem><PaginationLink href="#" isActive className="rounded-[10px] bg-burnt-umber text-white border-0 hover:bg-deep-cognac hover:text-white">2</PaginationLink></PaginationItem>
                <PaginationItem><PaginationLink href="#" className="rounded-[10px] hover:bg-cloud-fog hover:text-deep-cognac">3</PaginationLink></PaginationItem>
                <PaginationItem><PaginationEllipsis /></PaginationItem>
                <PaginationItem><PaginationLink href="#" className="rounded-[10px] hover:bg-cloud-fog hover:text-deep-cognac">12</PaginationLink></PaginationItem>
                <PaginationItem><PaginationNext href="#" className="rounded-[10px] hover:bg-cloud-fog hover:text-deep-cognac" /></PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        </section>

        {/* 10 Layout: Tabs + AspectRatio + ScrollArea + Carousel */}
        <section className="space-y-8">
          <SectionHeader num="10" kicker="Layout" title="Tabs, ratios, scroll, carousel" />

          {/* Tabs — underline variant */}
          <Tabs defaultValue="account" className="w-full">
            <TabsList variant="line" className="w-full justify-start gap-8 px-0 h-11">
              <TabsTrigger value="account" className="flex-none px-2 h-11 text-[15px] font-medium text-muted-stone hover:text-deep-cognac data-[state=active]:text-deep-cognac rounded-none border-b-[1px] border-l-0 border-r-0 border-t-0 border-b-muted-stone/30 hover:border-b-muted-stone/60 data-[state=active]:border-b-transparent after:!bottom-[-1px] after:!h-[2px] after:!bg-burnt-umber">Account</TabsTrigger>
              <TabsTrigger value="password" className="flex-none px-2 h-11 text-[15px] font-medium text-muted-stone hover:text-deep-cognac data-[state=active]:text-deep-cognac rounded-none border-b-[1px] border-l-0 border-r-0 border-t-0 border-b-muted-stone/30 hover:border-b-muted-stone/60 data-[state=active]:border-b-transparent after:!bottom-[-1px] after:!h-[2px] after:!bg-burnt-umber">Password</TabsTrigger>
              <TabsTrigger value="settings" className="flex-none px-2 h-11 text-[15px] font-medium text-muted-stone hover:text-deep-cognac data-[state=active]:text-deep-cognac rounded-none border-b-[1px] border-l-0 border-r-0 border-t-0 border-b-muted-stone/30 hover:border-b-muted-stone/60 data-[state=active]:border-b-transparent after:!bottom-[-1px] after:!h-[2px] after:!bg-burnt-umber">Settings</TabsTrigger>
            </TabsList>
            <TabsContent value="account" className="mt-6">
              <div className="space-y-2">
                <h3 className={subheading}>Account</h3>
                <p className={`${body} text-muted-stone max-w-2xl`}>Manage your account settings and preferences. Updates to name, email, and notification preferences save automatically.</p>
              </div>
            </TabsContent>
            <TabsContent value="password" className="mt-6">
              <p className={`${body} text-muted-stone max-w-2xl`}>Rotate your password and review active sessions across devices.</p>
            </TabsContent>
            <TabsContent value="settings" className="mt-6">
              <p className={`${body} text-muted-stone max-w-2xl`}>Theme, locale, and accessibility preferences live here.</p>
            </TabsContent>
          </Tabs>

          {/* Compact filter — segmented */}
          <div className="pt-2">
            <p className={`${caption} text-pressed-cacao mb-3`}>Compact filter — segmented</p>
            <Tabs defaultValue="score" className="w-fit">
              <TabsList className="rounded-full bg-cloud-fog p-1 h-11 gap-1 items-center">
                <TabsTrigger value="score" className="!h-9 rounded-full px-5 text-[14px] font-medium !text-deep-cognac data-[state=active]:!bg-burnt-umber data-[state=active]:!text-white data-[state=active]:!shadow-none">Score</TabsTrigger>
                <TabsTrigger value="reviews" className="!h-9 rounded-full px-5 text-[14px] font-medium !text-deep-cognac data-[state=active]:!bg-burnt-umber data-[state=active]:!text-white data-[state=active]:!shadow-none">Reviews</TabsTrigger>
                <TabsTrigger value="details" className="!h-9 rounded-full px-5 text-[14px] font-medium !text-deep-cognac data-[state=active]:!bg-burnt-umber data-[state=active]:!text-white data-[state=active]:!shadow-none">Details</TabsTrigger>
                <TabsTrigger value="similar" className="!h-9 rounded-full px-5 text-[14px] font-medium !text-deep-cognac data-[state=active]:!bg-burnt-umber data-[state=active]:!text-white data-[state=active]:!shadow-none">Similar</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* AspectRatio + ScrollArea side by side */}
          <div className="grid md:grid-cols-2 gap-5">
            <div className="rounded-[20px] bg-card border border-border p-6 space-y-3">
              <p className={`${caption} text-pressed-cacao`}>AspectRatio · 16:9</p>
              <AspectRatio ratio={16 / 9} className="rounded-[12px] bg-cloud-fog flex items-center justify-center">
                <p className={`${body} text-pressed-cacao`}>16 / 9</p>
              </AspectRatio>
            </div>
            <div className="rounded-[20px] bg-card border border-border p-6 space-y-3">
              <p className={`${caption} text-pressed-cacao`}>ScrollArea · 192px tall</p>
              <ScrollArea className="h-48 rounded-[12px] border border-border bg-parchment-white p-4">
                <ol className="space-y-2">
                  {Array.from({ length: 18 }).map((_, i) => (
                    <li key={i} className={`${body} text-deep-cognac`}>
                      {i + 1}. Item entry · captured at {String(i + 1).padStart(2, "0")}:00
                    </li>
                  ))}
                </ol>
              </ScrollArea>
            </div>
          </div>

          {/* Carousel */}
          <div className="rounded-[20px] bg-card border border-border p-6 space-y-3">
            <p className={`${caption} text-pressed-cacao`}>Carousel · 3 slides</p>
            <Carousel className="w-full">
              <CarouselContent>
                {["First", "Second", "Third"].map((label, i) => (
                  <CarouselItem key={i} className="md:basis-1/2 lg:basis-1/3">
                    <AspectRatio ratio={4 / 3} className="rounded-[12px] bg-cloud-fog flex items-center justify-center">
                      <span className={`${headingSm} text-deep-cognac`}>{label}</span>
                    </AspectRatio>
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious className="rounded-[10px] border-muted-stone text-deep-cognac hover:bg-cloud-fog" />
              <CarouselNext className="rounded-[10px] border-muted-stone text-deep-cognac hover:bg-cloud-fog" />
            </Carousel>
          </div>
        </section>

        {/* 11 Disclosure — Accordion + Collapsible */}
        <section className="space-y-8">
          <SectionHeader num="11" kicker="Disclosure" title="Accordion & collapsible" />
          <Accordion type="single" collapsible className="w-full rounded-[20px] bg-card border border-border px-6">
            <AccordionItem value="item-1" className="border-b border-border last:border-b-0">
              <AccordionTrigger className={`${subheading} py-5 hover:no-underline text-deep-cognac`}>Is the kit accessible?</AccordionTrigger>
              <AccordionContent className={`${body} text-muted-stone pb-5`}>Every component adheres to the WAI-ARIA design pattern.</AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-2" className="border-b border-border last:border-b-0">
              <AccordionTrigger className={`${subheading} py-5 hover:no-underline text-deep-cognac`}>Can I theme it?</AccordionTrigger>
              <AccordionContent className={`${body} text-muted-stone pb-5`}>Swap the eleven Delphi tokens in <code className="font-mono text-[13px]">globals.css</code> and every primitive picks up the new palette.</AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-3" className="border-b border-border last:border-b-0">
              <AccordionTrigger className={`${subheading} py-5 hover:no-underline text-deep-cognac`}>Is it animated?</AccordionTrigger>
              <AccordionContent className={`${body} text-muted-stone pb-5`}>150ms ease for hover, 240ms ease-in-out for expanding regions. Prefers-reduced-motion is honored.</AccordionContent>
            </AccordionItem>
          </Accordion>
          <div className="rounded-[20px] bg-card border border-border p-6 space-y-3">
            <p className={`${caption} text-pressed-cacao`}>Collapsible</p>
            <Collapsible className="space-y-3">
              <CollapsibleTrigger asChild>
                <Button variant="outline" className={secondaryBtn}>Toggle details <ChevronDown className="size-4" strokeWidth={1.75} /></Button>
              </CollapsibleTrigger>
              <CollapsibleContent className={`${body} text-muted-stone rounded-[12px] bg-cloud-fog p-4`}>
                Smoothly expands and collapses with the configured ease curve. Honors prefers-reduced-motion.
              </CollapsibleContent>
            </Collapsible>
          </div>
        </section>

        {/* 12 Navigation — Breadcrumb, NavigationMenu, Menubar */}
        <section className="space-y-8">
          <SectionHeader num="12" kicker="Navigation" title="Breadcrumb, nav menu, menubar" />
          <div className="rounded-[16px] bg-card border border-border p-5">
            <Breadcrumb>
              <BreadcrumbList className={body}>
                <BreadcrumbItem><BreadcrumbLink href="/" className="text-muted-stone hover:text-deep-cognac">Home</BreadcrumbLink></BreadcrumbItem>
                <BreadcrumbSeparator className="text-muted-stone" />
                <BreadcrumbItem><BreadcrumbLink href="/components" className="text-muted-stone hover:text-deep-cognac">Components</BreadcrumbLink></BreadcrumbItem>
                <BreadcrumbSeparator className="text-muted-stone" />
                <BreadcrumbItem><BreadcrumbPage className="text-deep-cognac font-medium">Delphi</BreadcrumbPage></BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>

          <div className="rounded-[20px] bg-card border border-border p-6 space-y-3">
            <p className={`${caption} text-pressed-cacao`}>NavigationMenu</p>
            <NavigationMenu>
              <NavigationMenuList>
                <NavigationMenuItem>
                  <NavigationMenuTrigger className="rounded-[10px] text-deep-cognac hover:bg-cloud-fog data-[state=open]:bg-cloud-fog text-[15px]">Industries</NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <ul className="grid w-[400px] gap-2 p-4 md:grid-cols-2">
                      {["Education", "Coaching", "Legal", "Therapy"].map((item) => (
                        <li key={item}>
                          <NavigationMenuLink className={`${body} block rounded-[10px] p-3 text-deep-cognac hover:bg-cloud-fog`} href="#">{item}</NavigationMenuLink>
                        </li>
                      ))}
                    </ul>
                  </NavigationMenuContent>
                </NavigationMenuItem>
                <NavigationMenuItem>
                  <NavigationMenuTrigger className="rounded-[10px] text-deep-cognac hover:bg-cloud-fog data-[state=open]:bg-cloud-fog text-[15px]">Resources</NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <ul className="grid w-[300px] gap-2 p-4">
                      {["Documentation", "Guides", "Changelog"].map((item) => (
                        <li key={item}>
                          <NavigationMenuLink className={`${body} block rounded-[10px] p-3 text-deep-cognac hover:bg-cloud-fog`} href="#">{item}</NavigationMenuLink>
                        </li>
                      ))}
                    </ul>
                  </NavigationMenuContent>
                </NavigationMenuItem>
                <NavigationMenuItem>
                  <NavigationMenuLink className={`${body} px-4 py-2 rounded-[10px] text-deep-cognac hover:bg-cloud-fog inline-flex items-center`} href="#">Pricing</NavigationMenuLink>
                </NavigationMenuItem>
              </NavigationMenuList>
            </NavigationMenu>
          </div>

          <div className="rounded-[20px] bg-card border border-border p-6 space-y-3">
            <p className={`${caption} text-pressed-cacao`}>Menubar</p>
            <Menubar className="rounded-[10px] border border-border bg-parchment-white">
              <MenubarMenu>
                <MenubarTrigger className="rounded-[8px] text-[15px] text-deep-cognac data-[state=open]:bg-cloud-fog">File</MenubarTrigger>
                <MenubarContent className="rounded-[12px] border-border">
                  <MenubarItem className={body}>New file <MenubarShortcut>⌘N</MenubarShortcut></MenubarItem>
                  <MenubarItem className={body}>Open <MenubarShortcut>⌘O</MenubarShortcut></MenubarItem>
                  <MenubarSeparator />
                  <MenubarItem className={body}>Save <MenubarShortcut>⌘S</MenubarShortcut></MenubarItem>
                </MenubarContent>
              </MenubarMenu>
              <MenubarMenu>
                <MenubarTrigger className="rounded-[8px] text-[15px] text-deep-cognac data-[state=open]:bg-cloud-fog">Edit</MenubarTrigger>
                <MenubarContent className="rounded-[12px] border-border">
                  <MenubarItem className={body}>Undo <MenubarShortcut>⌘Z</MenubarShortcut></MenubarItem>
                  <MenubarItem className={body}>Redo <MenubarShortcut>⇧⌘Z</MenubarShortcut></MenubarItem>
                </MenubarContent>
              </MenubarMenu>
              <MenubarMenu>
                <MenubarTrigger className="rounded-[8px] text-[15px] text-deep-cognac data-[state=open]:bg-cloud-fog">View</MenubarTrigger>
                <MenubarContent className="rounded-[12px] border-border">
                  <MenubarItem className={body}>Zoom in <MenubarShortcut>⌘+</MenubarShortcut></MenubarItem>
                  <MenubarItem className={body}>Zoom out <MenubarShortcut>⌘−</MenubarShortcut></MenubarItem>
                </MenubarContent>
              </MenubarMenu>
            </Menubar>
          </div>
        </section>

        {/* 13 Identity — Avatars + Kbd */}
        <section className="space-y-8">
          <SectionHeader num="13" kicker="Identity" title="Avatars & keys" lede="Testimonial avatars use a 70px radius — generous, almost-round but with a hint of corner. Kbd shows keyboard shortcuts in the editorial UI." />
          <div className="rounded-[20px] bg-card border border-border p-5 flex flex-wrap gap-4 items-center">
            <Avatar className="size-14 rounded-[70px]"><AvatarImage src="https://github.com/shadcn.png" alt="" className="rounded-[70px]" /><AvatarFallback className="bg-cloud-fog text-deep-cognac rounded-[70px]">CN</AvatarFallback></Avatar>
            <Avatar className="size-14 rounded-[70px]"><AvatarFallback className="bg-burnt-umber text-white rounded-[70px]">JG</AvatarFallback></Avatar>
            <Avatar className="size-14 rounded-[70px]"><AvatarFallback className="bg-cloud-fog text-deep-cognac rounded-[70px]">AB</AvatarFallback></Avatar>
            <Avatar className="size-10 rounded-[70px]"><AvatarFallback className="bg-pressed-cacao text-parchment-white rounded-[70px] text-[13px]">PI</AvatarFallback></Avatar>
            <Avatar className="size-20 rounded-[70px]"><AvatarFallback className="bg-cloud-fog text-deep-cognac rounded-[70px]"><User className="size-8" strokeWidth={1.5} /></AvatarFallback></Avatar>
          </div>
          <div className="rounded-[20px] bg-card border border-border p-6 space-y-4">
            <p className={`${caption} text-pressed-cacao`}>Kbd / KbdGroup</p>
            <div className="flex flex-wrap gap-6 items-center">
              <div className="flex items-center gap-2">
                <span className={body}>Quick open:</span>
                <KbdGroup>
                  <Kbd className="rounded-[6px] bg-cloud-fog border border-border px-2 py-0.5 text-[12px] font-mono text-deep-cognac">⌘</Kbd>
                  <Kbd className="rounded-[6px] bg-cloud-fog border border-border px-2 py-0.5 text-[12px] font-mono text-deep-cognac">K</Kbd>
                </KbdGroup>
              </div>
              <div className="flex items-center gap-2">
                <span className={body}>Save:</span>
                <KbdGroup>
                  <Kbd className="rounded-[6px] bg-cloud-fog border border-border px-2 py-0.5 text-[12px] font-mono text-deep-cognac">⌘</Kbd>
                  <Kbd className="rounded-[6px] bg-cloud-fog border border-border px-2 py-0.5 text-[12px] font-mono text-deep-cognac">S</Kbd>
                </KbdGroup>
              </div>
            </div>
          </div>
        </section>

        {/* 14 Overlay — Dialog, AlertDialog, Sheet, Drawer, Popover, HoverCard, DropdownMenu, ContextMenu, Tooltip */}
        <section className="space-y-8">
          <SectionHeader num="14" kicker="Overlay" title="Dialogs, sheets, popovers, menus" lede="Every overlay sits on Parchment with the same 12–16px radii. Tooltip uses a dark Deep Cognac surface for legibility." />

          <div className="rounded-[20px] bg-card border border-border p-6 flex flex-wrap gap-3">
            {/* Dialog */}
            <Dialog>
              <DialogTrigger asChild><Button variant="outline" className={secondaryBtn}>Dialog</Button></DialogTrigger>
              <DialogContent className="rounded-[16px] bg-card border-border p-6 max-w-md sm:max-w-md">
                <DialogHeader className="space-y-1">
                  <DialogTitle className={`${subheading} text-deep-cognac`}>Rotate API key</DialogTitle>
                  <DialogDescription className={`${body} text-muted-stone`}>This invalidates the current key immediately.</DialogDescription>
                </DialogHeader>
                <div className="space-y-1.5 pt-1">
                  <Label htmlFor="key-name" className={`${body} font-medium text-deep-cognac`}>Key name</Label>
                  <Input id="key-name" placeholder="production-router" className="h-11 px-4 rounded-[12px] bg-parchment-white border-muted-stone text-[15px]" />
                </div>
                <div className="flex gap-2 pt-2 justify-end">
                  <Button variant="outline" className={secondaryBtn}>Cancel</Button>
                  <Button className={primaryBtn}>Rotate</Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* AlertDialog */}
            <AlertDialog>
              <AlertDialogTrigger asChild><Button className="h-11 px-4 rounded-[12px] bg-fire-opal hover:bg-sunset-orange text-white font-medium text-[15px] shadow-none">AlertDialog</Button></AlertDialogTrigger>
              <AlertDialogContent className="rounded-[16px] bg-card border-border p-6">
                <AlertDialogHeader className="space-y-1">
                  <AlertDialogTitle className={`${subheading} text-deep-cognac`}>Delete this feed?</AlertDialogTitle>
                  <AlertDialogDescription className={`${body} text-muted-stone`}>This removes the source and drops cached items.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="gap-2 sm:gap-2">
                  <AlertDialogCancel className={secondaryBtn}>Cancel</AlertDialogCancel>
                  <AlertDialogAction className="h-11 px-4 rounded-[12px] bg-fire-opal hover:bg-sunset-orange text-white font-medium text-[15px] shadow-none">Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* Sheet */}
            <Sheet>
              <SheetTrigger asChild><Button variant="outline" className={secondaryBtn}>Sheet</Button></SheetTrigger>
              <SheetContent className="bg-card border-border">
                <SheetHeader>
                  <SheetTitle className={`${subheading} text-deep-cognac`}>Filters</SheetTitle>
                  <SheetDescription className={`${body} text-muted-stone`}>Refine what you see in the feed.</SheetDescription>
                </SheetHeader>
                <div className="p-4 space-y-4">
                  <div className="space-y-1.5">
                    <Label className={`${body} font-medium text-deep-cognac`}>Topic</Label>
                    <Input placeholder="e.g. AI, tech…" className="h-11 px-4 rounded-[12px] bg-parchment-white border-muted-stone text-[15px]" />
                  </div>
                </div>
                <SheetFooter>
                  <SheetClose asChild><Button variant="outline" className={secondaryBtn}>Cancel</Button></SheetClose>
                  <Button className={primaryBtn}>Apply</Button>
                </SheetFooter>
              </SheetContent>
            </Sheet>

            {/* Drawer */}
            <Drawer>
              <DrawerTrigger asChild><Button variant="outline" className={secondaryBtn}>Drawer</Button></DrawerTrigger>
              <DrawerContent className="bg-card border-border">
                <DrawerHeader>
                  <DrawerTitle className={`${subheading} text-deep-cognac`}>Choose a moment</DrawerTitle>
                  <DrawerDescription className={`${body} text-muted-stone`}>Bottom-sheet style for mobile contexts.</DrawerDescription>
                </DrawerHeader>
                <div className="p-4 space-y-3">
                  <Button className={primaryBtn}>Save the day</Button>
                </div>
                <DrawerFooter>
                  <DrawerClose asChild><Button variant="outline" className={secondaryBtn}>Close</Button></DrawerClose>
                </DrawerFooter>
              </DrawerContent>
            </Drawer>

            {/* Popover */}
            <Popover>
              <PopoverTrigger asChild><Button variant="outline" className={secondaryBtn}>Popover</Button></PopoverTrigger>
              <PopoverContent className="rounded-[16px] bg-card border-border p-4 w-80">
                <div className="space-y-2">
                  <p className={`${bodyMedium} text-deep-cognac`}>Quick note</p>
                  <p className={`${body} text-muted-stone`}>Anchored to the trigger. Useful for date pickers, filter chips, brief forms.</p>
                </div>
              </PopoverContent>
            </Popover>

            {/* HoverCard */}
            <HoverCard>
              <HoverCardTrigger asChild>
                <Button variant="outline" className={secondaryBtn}><User className="size-4" strokeWidth={1.75} /> @eleanor</Button>
              </HoverCardTrigger>
              <HoverCardContent className="rounded-[16px] bg-card border-border p-4 w-80">
                <div className="flex items-start gap-3">
                  <Avatar className="size-12 rounded-[70px]"><AvatarFallback className="bg-cloud-fog text-deep-cognac rounded-[70px]">EB</AvatarFallback></Avatar>
                  <div className="space-y-1">
                    <p className={`${bodyMedium} text-deep-cognac`}>Eleanor Bryce</p>
                    <p className={`${body} text-muted-stone`}>Cognitive scientist · author. Last seen 2h ago.</p>
                  </div>
                </div>
              </HoverCardContent>
            </HoverCard>

            {/* DropdownMenu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className={secondaryBtn}><User className="size-4" strokeWidth={1.75} /> Account <ChevronDown className="size-4" strokeWidth={1.75} /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="rounded-[16px] bg-card border-border min-w-56">
                <DropdownMenuLabel className={`${caption} text-pressed-cacao`}>Signed in</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem className={`${body} text-deep-cognac`}>
                  <User className="size-4 text-muted-stone" strokeWidth={1.75} /> Profile <DropdownMenuShortcut>⌘P</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem className={`${body} text-deep-cognac`}>
                  <Settings className="size-4 text-muted-stone" strokeWidth={1.75} /> Settings <DropdownMenuShortcut>⌘,</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem className={`${body} text-deep-cognac`}>
                  <Mail className="size-4 text-muted-stone" strokeWidth={1.75} /> Inbox
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className={`${body} text-fire-opal`}>Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Tooltip */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-11 w-11 rounded-[12px] text-deep-cognac hover:bg-cloud-fog" aria-label="Notifications">
                    <Bell className="size-5" strokeWidth={1.5} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="rounded-[10px] bg-deep-cognac text-parchment-white px-3 py-1.5 text-[13px] font-normal">Notifications</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* ContextMenu — full-width target */}
          <div className="rounded-[20px] bg-card border border-border p-6 space-y-3">
            <p className={`${caption} text-pressed-cacao`}>ContextMenu — right-click the panel</p>
            <ContextMenu>
              <ContextMenuTrigger className="block">
                <div className="rounded-[12px] bg-cloud-fog border border-border h-40 flex items-center justify-center">
                  <p className={`${body} text-pressed-cacao`}>Right-click anywhere inside this panel</p>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent className="rounded-[16px] bg-card border-border min-w-56">
                <ContextMenuItem className={`${body} text-deep-cognac`}>
                  <Plus className="size-4 text-muted-stone" strokeWidth={1.75} /> New entry <ContextMenuShortcut>⌘N</ContextMenuShortcut>
                </ContextMenuItem>
                <ContextMenuItem className={`${body} text-deep-cognac`}>
                  <ArrowRight className="size-4 text-muted-stone" strokeWidth={1.75} /> Open in editor
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem className={`${body} text-fire-opal`}>Delete</ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          </div>
        </section>

        {/* Footer */}
        <footer className="pt-12 pb-8 border-t border-border text-center space-y-2">
          <p className={`${body} text-deep-cognac`}>
            <strong className="font-medium">Design system:</strong> Delphi — Cognac-Stained Parchment
          </p>
          <p className="font-sans text-[13px] text-muted-stone">
            Source Serif 4 · Inter · 12px button radii · 16–20px card radii · 70px testimonial avatars · Light theme only
          </p>
        </footer>
      </div>
    </main>
  );
}
