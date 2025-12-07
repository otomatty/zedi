import { createSignal } from "solid-js";
import { A } from "@solidjs/router";
import {
  Button,
  Input,
  Textarea,
  Checkbox,
  Switch,
  Select,
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogCloseButton,
  Drawer,
  DrawerTrigger,
  DrawerPortal,
  DrawerOverlay,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerFooter,
  DrawerTitle,
  Tabs,
  TabList,
  Tab,
  TabPanel,
  Tooltip,
  Badge,
  Spinner,
  Avatar,
  Skeleton,
  SkeletonText,
  Card,
  CardHeader,
  CardContent,
  CardTitle,
  // New components
  Heading,
  Text,
  Code,
  Divider,
  Alert,
  Progress,
  Toast,
} from "../components/ui";

export default function UILibrary() {
  const [darkMode, setDarkMode] = createSignal(false);
  const [checkboxChecked, setCheckboxChecked] = createSignal(false);
  const [switchOn, setSwitchOn] = createSignal(false);
  const [isLoaded, setIsLoaded] = createSignal(false);

  const toggleDarkMode = () => {
    setDarkMode(!darkMode());
    document.documentElement.classList.toggle("dark", !darkMode());
  };

  const selectOptions = [
    { value: "option1", label: "オプション 1", description: "最初の選択肢" },
    { value: "option2", label: "オプション 2", description: "2番目の選択肢" },
    { value: "option3", label: "オプション 3", disabled: true },
  ];

  return (
    <div class={`min-h-screen transition-colors duration-300 ${darkMode() ? "dark" : ""}`}>
      {/* Header */}
      <header class="sticky top-0 z-50 bg-[var(--bg-base)]/80 backdrop-blur-xl border-b border-[var(--border-subtle)]">
        <div class="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <A href="/" class="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <div class="w-8 h-8 rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center">
                <span class="text-white font-bold text-sm">Z</span>
              </div>
              <h1 class="text-xl font-semibold text-[var(--text-primary)]">Zedi</h1>
            </A>
            <Badge variant="flat" color="primary">UI Library</Badge>
          </div>
          <Button variant="ghost" size="sm" onClick={toggleDarkMode}>
            {darkMode() ? "☀️ Light" : "🌙 Dark"}
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main class="max-w-5xl mx-auto px-6 py-8">
        <div class="mb-8">
          <h1 class="text-3xl font-bold text-[var(--text-primary)] mb-2">
            UIコンポーネントライブラリ
          </h1>
          <p class="text-[var(--text-secondary)]">
            Kobalte + Hero UIスタイルで構築された基礎コンポーネント一覧
          </p>
        </div>

        {/* Form Controls Section */}
        <section class="mb-12">
          <h2 class="text-2xl font-bold text-[var(--text-primary)] mb-6 pb-2 border-b border-[var(--border-subtle)]">
            フォームコントロール
          </h2>

          {/* Input */}
          <Card class="mb-6">
            <CardHeader>
              <CardTitle>Input</CardTitle>
            </CardHeader>
            <CardContent>
              <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <Input
                  label="Flat (デフォルト)"
                  placeholder="入力してください"
                  variant="flat"
                />
                <Input
                  label="Bordered"
                  placeholder="入力してください"
                  variant="bordered"
                />
                <Input
                  label="Underlined"
                  placeholder="入力してください"
                  variant="underlined"
                />
              </div>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="必須フィールド"
                  placeholder="メールアドレス"
                  isRequired
                  description="お知らせを受け取るメールアドレス"
                />
                <Input
                  label="エラー状態"
                  placeholder="入力エラー"
                  isInvalid
                  errorMessage="有効な値を入力してください"
                />
              </div>
            </CardContent>
          </Card>

          {/* Textarea */}
          <Card class="mb-6">
            <CardHeader>
              <CardTitle>Textarea</CardTitle>
            </CardHeader>
            <CardContent>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Textarea
                  label="メモ"
                  placeholder="自由に入力してください..."
                  variant="bordered"
                  minRows={3}
                />
                <Textarea
                  label="説明文"
                  placeholder="詳細を入力..."
                  variant="flat"
                  description="最大500文字まで"
                />
              </div>
            </CardContent>
          </Card>

          {/* Select */}
          <Card class="mb-6">
            <CardHeader>
              <CardTitle>Select</CardTitle>
            </CardHeader>
            <CardContent>
              <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Select
                  label="Flat"
                  placeholder="選択してください"
                  options={selectOptions}
                  variant="flat"
                />
                <Select
                  label="Bordered"
                  placeholder="選択してください"
                  options={selectOptions}
                  variant="bordered"
                />
                <Select
                  label="必須"
                  placeholder="選択してください"
                  options={selectOptions}
                  isRequired
                  description="カテゴリを選択"
                />
              </div>
            </CardContent>
          </Card>

          {/* Checkbox & Switch */}
          <Card class="mb-6">
            <CardHeader>
              <CardTitle>Checkbox & Switch</CardTitle>
            </CardHeader>
            <CardContent>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div class="space-y-4">
                  <h4 class="font-medium text-[var(--text-primary)] mb-2">Checkbox</h4>
                  <div class="space-y-3">
                    <Checkbox
                      label="デフォルト"
                      description="チェックボックスの説明文"
                      isSelected={checkboxChecked()}
                      onCheckedChange={setCheckboxChecked}
                    />
                    <Checkbox label="Primary" color="primary" isSelected />
                    <Checkbox label="Success" color="success" isSelected />
                    <Checkbox label="Warning" color="warning" isSelected />
                    <Checkbox label="Danger" color="danger" isSelected />
                    <Checkbox label="無効" isDisabled />
                  </div>
                </div>
                <div class="space-y-4">
                  <h4 class="font-medium text-[var(--text-primary)] mb-2">Switch</h4>
                  <div class="space-y-3">
                    <Switch
                      label="通知を受け取る"
                      description="新着情報をプッシュ通知"
                      isSelected={switchOn()}
                      onCheckedChange={setSwitchOn}
                    />
                    <Switch label="Primary" color="primary" isSelected />
                    <Switch label="Success" color="success" isSelected />
                    <Switch label="Warning" color="warning" isSelected />
                    <Switch label="Danger" color="danger" isSelected />
                    <Switch label="無効" isDisabled />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Button Section */}
        <section class="mb-12">
          <h2 class="text-2xl font-bold text-[var(--text-primary)] mb-6 pb-2 border-b border-[var(--border-subtle)]">
            ボタン
          </h2>
          <Card>
            <CardContent class="space-y-6">
              <div>
                <h4 class="font-medium text-[var(--text-primary)] mb-3">バリアント</h4>
                <div class="flex flex-wrap gap-3">
                  <Button variant="solid" color="primary">Solid</Button>
                  <Button variant="bordered" color="primary">Bordered</Button>
                  <Button variant="flat" color="primary">Flat</Button>
                  <Button variant="light" color="primary">Light</Button>
                  <Button variant="ghost" color="primary">Ghost</Button>
                  <Button variant="shadow" color="primary">Shadow</Button>
                </div>
              </div>
              <div>
                <h4 class="font-medium text-[var(--text-primary)] mb-3">カラー</h4>
                <div class="flex flex-wrap gap-3">
                  <Button variant="solid" color="default">Default</Button>
                  <Button variant="solid" color="primary">Primary</Button>
                  <Button variant="solid" color="secondary">Secondary</Button>
                  <Button variant="solid" color="success">Success</Button>
                  <Button variant="solid" color="warning">Warning</Button>
                  <Button variant="solid" color="danger">Danger</Button>
                </div>
              </div>
              <div>
                <h4 class="font-medium text-[var(--text-primary)] mb-3">サイズ</h4>
                <div class="flex flex-wrap items-center gap-3">
                  <Button variant="solid" color="primary" size="sm">Small</Button>
                  <Button variant="solid" color="primary" size="md">Medium</Button>
                  <Button variant="solid" color="primary" size="lg">Large</Button>
                </div>
              </div>
              <div>
                <h4 class="font-medium text-[var(--text-primary)] mb-3">角丸（Radius）</h4>
                <div class="flex flex-wrap items-center gap-3">
                  <Button variant="solid" color="primary" radius="none">None</Button>
                  <Button variant="solid" color="primary" radius="sm">Small</Button>
                  <Button variant="solid" color="primary" radius="md">Medium</Button>
                  <Button variant="solid" color="primary" radius="lg">Large</Button>
                  <Button variant="solid" color="primary" radius="full">Full</Button>
                </div>
              </div>
              <div>
                <h4 class="font-medium text-[var(--text-primary)] mb-3">状態</h4>
                <div class="flex flex-wrap items-center gap-3">
                  <Button variant="solid" color="primary" disabled>Disabled</Button>
                  <Button variant="solid" color="primary" isIconOnly>🚀</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Overlay Section */}
        <section class="mb-12">
          <h2 class="text-2xl font-bold text-[var(--text-primary)] mb-6 pb-2 border-b border-[var(--border-subtle)]">
            オーバーレイ
          </h2>

          <Card class="mb-6">
            <CardHeader>
              <CardTitle>Dialog & Drawer</CardTitle>
            </CardHeader>
            <CardContent>
              <div class="flex flex-wrap gap-4">
                {/* Dialog Demo */}
                <Dialog>
                  <DialogTrigger as={Button} variant="solid" color="primary">
                    モーダルを開く
                  </DialogTrigger>
                  <DialogPortal>
                    <DialogOverlay />
                    <DialogContent size="md">
                      <DialogCloseButton />
                      <DialogHeader>
                        <DialogTitle>ダイアログタイトル</DialogTitle>
                        <DialogDescription>
                          これはダイアログの説明文です。
                        </DialogDescription>
                      </DialogHeader>
                      <DialogBody>
                        <p class="text-[var(--text-secondary)]">
                          ダイアログの本文コンテンツがここに表示されます。
                          ブラーオーバーレイとスケールインアニメーションが特徴です。
                        </p>
                        <Input
                          label="入力フィールド"
                          placeholder="何か入力..."
                          class="mt-4"
                          variant="bordered"
                        />
                      </DialogBody>
                      <DialogFooter>
                        <Button variant="ghost">キャンセル</Button>
                        <Button variant="solid" color="primary">確認</Button>
                      </DialogFooter>
                    </DialogContent>
                  </DialogPortal>
                </Dialog>

                {/* Drawer Demo */}
                <Drawer>
                  <DrawerTrigger as={Button} variant="bordered" color="secondary">
                    ドロワーを開く
                  </DrawerTrigger>
                  <DrawerPortal>
                    <DrawerOverlay />
                    <DrawerContent>
                      <DrawerHeader>
                        <DrawerTitle>ドロワータイトル</DrawerTitle>
                      </DrawerHeader>
                      <DrawerBody>
                        <p class="text-[var(--text-secondary)] mb-4">
                          下からスライドアップするドロワーです。
                          モバイルUIに最適です。
                        </p>
                        <div class="space-y-4">
                          <Input label="名前" placeholder="お名前" variant="bordered" />
                          <Input label="メール" placeholder="email@example.com" variant="bordered" />
                        </div>
                      </DrawerBody>
                      <DrawerFooter>
                        <Button variant="solid" color="primary" class="w-full">保存</Button>
                      </DrawerFooter>
                    </DrawerContent>
                  </DrawerPortal>
                </Drawer>
              </div>
            </CardContent>
          </Card>

          {/* Tooltip */}
          <Card>
            <CardHeader>
              <CardTitle>Tooltip</CardTitle>
            </CardHeader>
            <CardContent>
              <div class="flex flex-wrap gap-4">
                <Tooltip content="上に表示" placement="top">
                  <Button variant="ghost">上</Button>
                </Tooltip>
                <Tooltip content="下に表示" placement="bottom">
                  <Button variant="ghost">下</Button>
                </Tooltip>
                <Tooltip content="左に表示" placement="left">
                  <Button variant="ghost">左</Button>
                </Tooltip>
                <Tooltip content="右に表示" placement="right">
                  <Button variant="ghost">右</Button>
                </Tooltip>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Tabs Section */}
        <section class="mb-12">
          <h2 class="text-2xl font-bold text-[var(--text-primary)] mb-6 pb-2 border-b border-[var(--border-subtle)]">
            タブ
          </h2>
          <Card>
            <CardContent class="space-y-8">
              <div>
                <h4 class="font-medium text-[var(--text-primary)] mb-3">Solid (デフォルト)</h4>
                <Tabs defaultValue="tab1">
                  <TabList variant="solid">
                    <Tab value="tab1" variant="solid">タブ 1</Tab>
                    <Tab value="tab2" variant="solid">タブ 2</Tab>
                    <Tab value="tab3" variant="solid">タブ 3</Tab>
                  </TabList>
                  <TabPanel value="tab1">タブ1のコンテンツ</TabPanel>
                  <TabPanel value="tab2">タブ2のコンテンツ</TabPanel>
                  <TabPanel value="tab3">タブ3のコンテンツ</TabPanel>
                </Tabs>
              </div>
              <div>
                <h4 class="font-medium text-[var(--text-primary)] mb-3">Underlined</h4>
                <Tabs defaultValue="tab1">
                  <TabList variant="underlined">
                    <Tab value="tab1" variant="underlined">概要</Tab>
                    <Tab value="tab2" variant="underlined">詳細</Tab>
                    <Tab value="tab3" variant="underlined">設定</Tab>
                  </TabList>
                  <TabPanel value="tab1">概要タブのコンテンツ</TabPanel>
                  <TabPanel value="tab2">詳細タブのコンテンツ</TabPanel>
                  <TabPanel value="tab3">設定タブのコンテンツ</TabPanel>
                </Tabs>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Badge & Spinner & Avatar Section */}
        <section class="mb-12">
          <h2 class="text-2xl font-bold text-[var(--text-primary)] mb-6 pb-2 border-b border-[var(--border-subtle)]">
            バッジ・スピナー・アバター
          </h2>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Badge */}
            <Card>
              <CardHeader>
                <CardTitle>Badge</CardTitle>
              </CardHeader>
              <CardContent class="space-y-4">
                <div>
                  <h4 class="text-sm font-medium text-[var(--text-secondary)] mb-2">Solid</h4>
                  <div class="flex flex-wrap gap-2">
                    <Badge color="default">Default</Badge>
                    <Badge color="primary">Primary</Badge>
                    <Badge color="success">Success</Badge>
                    <Badge color="warning">Warning</Badge>
                    <Badge color="danger">Danger</Badge>
                  </div>
                </div>
                <div>
                  <h4 class="text-sm font-medium text-[var(--text-secondary)] mb-2">Flat</h4>
                  <div class="flex flex-wrap gap-2">
                    <Badge variant="flat" color="primary">Primary</Badge>
                    <Badge variant="flat" color="success">Success</Badge>
                    <Badge variant="flat" color="danger">Danger</Badge>
                  </div>
                </div>
                <div>
                  <h4 class="text-sm font-medium text-[var(--text-secondary)] mb-2">Shadow</h4>
                  <div class="flex flex-wrap gap-2">
                    <Badge variant="shadow" color="primary">Primary</Badge>
                    <Badge variant="shadow" color="success">Success</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Spinner */}
            <Card>
              <CardHeader>
                <CardTitle>Spinner</CardTitle>
              </CardHeader>
              <CardContent>
                <div class="space-y-4">
                  <div>
                    <h4 class="text-sm font-medium text-[var(--text-secondary)] mb-2">サイズ</h4>
                    <div class="flex items-center gap-4">
                      <Spinner size="sm" />
                      <Spinner size="md" />
                      <Spinner size="lg" />
                    </div>
                  </div>
                  <div>
                    <h4 class="text-sm font-medium text-[var(--text-secondary)] mb-2">カラー</h4>
                    <div class="flex items-center gap-4">
                      <Spinner color="primary" />
                      <Spinner color="success" />
                      <Spinner color="warning" />
                      <Spinner color="danger" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Avatar */}
            <Card>
              <CardHeader>
                <CardTitle>Avatar</CardTitle>
              </CardHeader>
              <CardContent>
                <div class="space-y-4">
                  <div>
                    <h4 class="text-sm font-medium text-[var(--text-secondary)] mb-2">サイズ</h4>
                    <div class="flex items-center gap-3">
                      <Avatar name="田中 太郎" size="sm" />
                      <Avatar name="Zedi AI" size="md" />
                      <Avatar name="User" size="lg" />
                    </div>
                  </div>
                  <div>
                    <h4 class="text-sm font-medium text-[var(--text-secondary)] mb-2">ボーダー</h4>
                    <div class="flex items-center gap-3">
                      <Avatar name="A" isBordered color="primary" />
                      <Avatar name="B" isBordered color="success" />
                      <Avatar name="C" isBordered color="danger" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Skeleton Section */}
        <section class="mb-12">
          <h2 class="text-2xl font-bold text-[var(--text-primary)] mb-6 pb-2 border-b border-[var(--border-subtle)]">
            スケルトン
          </h2>
          <Card>
            <CardContent>
              <div class="flex items-center gap-4 mb-4">
                <Button
                  variant="solid"
                  color={isLoaded() ? "secondary" : "primary"}
                  size="sm"
                  onClick={() => setIsLoaded(!isLoaded())}
                >
                  {isLoaded() ? "ローディング表示" : "コンテンツ表示"}
                </Button>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="space-y-4">
                  <Skeleton variant="circular" width="48px" height="48px" isLoaded={isLoaded()}>
                    <Avatar name="Demo User" size="lg" />
                  </Skeleton>
                  <SkeletonText lines={3} />
                </div>
                <div class="space-y-4">
                  <Skeleton variant="rectangular" width="100%" height="120px" isLoaded={isLoaded()}>
                    <div class="w-full h-[120px] rounded-xl bg-gradient-to-br from-primary-400 to-accent-500 flex items-center justify-center text-white font-medium">
                      コンテンツ
                    </div>
                  </Skeleton>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Typography Section */}
        <section class="mb-12">
          <h2 class="text-2xl font-bold text-[var(--text-primary)] mb-6 pb-2 border-b border-[var(--border-subtle)]">
            タイポグラフィー
          </h2>

          <Card class="mb-6">
            <CardHeader>
              <CardTitle>Heading</CardTitle>
            </CardHeader>
            <CardContent class="space-y-4">
              <div class="space-y-3">
                <Heading as="h1">見出し H1</Heading>
                <Heading as="h2">見出し H2</Heading>
                <Heading as="h3">見出し H3</Heading>
                <Heading as="h4">見出し H4</Heading>
                <Heading as="h5">見出し H5</Heading>
                <Heading as="h6">見出し H6</Heading>
              </div>
              <Divider label="グラデーション" />
              <Heading as="h2" isGradient>グラデーションテキスト</Heading>
              <Heading as="h3" color="primary">プライマリカラー</Heading>
            </CardContent>
          </Card>

          <Card class="mb-6">
            <CardHeader>
              <CardTitle>Text</CardTitle>
            </CardHeader>
            <CardContent class="space-y-4">
              <div class="space-y-2">
                <Text size="lg" weight="bold">大きいテキスト（Bold）</Text>
                <Text size="md">通常のテキスト。これは本文用のテキストコンポーネントです。</Text>
                <Text size="sm" color="secondary">小さいセカンダリテキスト</Text>
                <Text size="xs" color="tertiary">極小のターシャリテキスト</Text>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Code</CardTitle>
            </CardHeader>
            <CardContent class="space-y-4">
              <Text>
                インラインコード: <Code>const x = 42;</Code> のように使用できます。
              </Text>
              <Code variant="block">{`function hello() {
  console.log("Hello, World!");
}`}</Code>
            </CardContent>
          </Card>
        </section>

        {/* Divider Section */}
        <section class="mb-12">
          <h2 class="text-2xl font-bold text-[var(--text-primary)] mb-6 pb-2 border-b border-[var(--border-subtle)]">
            ディバイダー
          </h2>
          <Card>
            <CardContent class="space-y-6">
              <div>
                <h4 class="font-medium text-[var(--text-primary)] mb-3">スタイル</h4>
                <div class="space-y-4">
                  <Divider variant="solid" />
                  <Divider variant="dashed" />
                  <Divider variant="dotted" />
                </div>
              </div>
              <div>
                <h4 class="font-medium text-[var(--text-primary)] mb-3">ラベル付き</h4>
                <div class="space-y-4">
                  <Divider label="中央" labelPosition="center" />
                  <Divider label="左寄せ" labelPosition="start" />
                  <Divider label="右寄せ" labelPosition="end" />
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Alert Section */}
        <section class="mb-12">
          <h2 class="text-2xl font-bold text-[var(--text-primary)] mb-6 pb-2 border-b border-[var(--border-subtle)]">
            アラート
          </h2>
          <Card>
            <CardContent class="space-y-4">
              <Alert color="default" title="お知らせ">これはデフォルトのアラートです。</Alert>
              <Alert color="primary" title="ヒント">これはプライマリカラーのアラートです。</Alert>
              <Alert color="success" title="成功">処理が正常に完了しました。</Alert>
              <Alert color="warning" title="警告">この操作は慎重に行ってください。</Alert>
              <Alert color="danger" title="エラー" isClosable>問題が発生しました。</Alert>
              <Divider label="バリエーション" />
              <Alert variant="bordered" color="primary">ボーダースタイル</Alert>
              <Alert variant="solid" color="success">ソリッドスタイル</Alert>
            </CardContent>
          </Card>
        </section>

        {/* Progress Section */}
        <section class="mb-12">
          <h2 class="text-2xl font-bold text-[var(--text-primary)] mb-6 pb-2 border-b border-[var(--border-subtle)]">
            プログレス
          </h2>
          <Card>
            <CardContent class="space-y-6">
              <div>
                <h4 class="font-medium text-[var(--text-primary)] mb-3">基本</h4>
                <div class="space-y-4">
                  <Progress value={30} label="読み込み中" showValueLabel />
                  <Progress value={60} color="success" label="アップロード" showValueLabel />
                  <Progress value={90} color="warning" label="容量" showValueLabel />
                </div>
              </div>
              <div>
                <h4 class="font-medium text-[var(--text-primary)] mb-3">サイズ</h4>
                <div class="space-y-4">
                  <Progress value={50} size="sm" />
                  <Progress value={50} size="md" />
                  <Progress value={50} size="lg" />
                </div>
              </div>
              <div>
                <h4 class="font-medium text-[var(--text-primary)] mb-3">特殊効果</h4>
                <div class="space-y-4">
                  <Progress value={75} isStriped color="primary" />
                  <Progress isIndeterminate color="secondary" />
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Toast Section */}
        <section class="mb-12">
          <h2 class="text-2xl font-bold text-[var(--text-primary)] mb-6 pb-2 border-b border-[var(--border-subtle)]">
            トースト
          </h2>
          <Card>
            <CardHeader>
              <CardTitle>Toast（静的プレビュー）</CardTitle>
            </CardHeader>
            <CardContent class="space-y-4">
              <Toast color="default" title="お知らせ" description="新しいメッセージがあります。" />
              <Toast color="success" title="保存完了" description="ファイルが保存されました。" variant="flat" />
              <Toast color="warning" title="注意" description="ストレージ容量が残りわずかです。" variant="bordered" />
              <Toast color="danger" title="エラー" description="接続に失敗しました。" variant="solid" />
            </CardContent>
          </Card>
        </section>
      </main>

      {/* Footer */}
      <footer class="border-t border-[var(--border-subtle)] mt-12">
        <div class="max-w-5xl mx-auto px-6 py-6 text-center text-sm text-[var(--text-tertiary)]">
          Zedi UI Library • Kobalte + Hero UI Style
        </div>
      </footer>
    </div>
  );
}
