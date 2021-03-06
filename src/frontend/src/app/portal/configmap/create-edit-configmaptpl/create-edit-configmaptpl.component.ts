import {Component, OnInit, AfterViewInit, Inject, OnDestroy} from '@angular/core';
import {Location} from '@angular/common';
import 'rxjs/add/operator/debounceTime';
import 'rxjs/add/operator/distinctUntilChanged';
import {FormArray, FormBuilder, FormGroup} from '@angular/forms';
import {MessageHandlerService} from '../../../shared/message-handler/message-handler.service';
import {ActionType, appLabelKey, namespaceLabelKey} from '../../../shared/shared.const';
import {ActivatedRoute, Router} from '@angular/router';
import {Observable} from 'rxjs/Observable';
import {DOCUMENT, EventManager} from '@angular/platform-browser';
import {ConfigMapTpl} from '../../../shared/model/v1/configmaptpl';
import {App} from '../../../shared/model/v1/app';
import {ConfigMap} from '../../../shared/model/v1/configmap';
import {KubeConfigMap, ObjectMeta} from '../../../shared/model/v1/kubernetes/configmap';
import {ConfigMapTplService} from '../../../shared/client/v1/configmaptpl.service';
import {ConfigMapService} from '../../../shared/client/v1/configmap.service';
import {AppService} from '../../../shared/client/v1/app.service';
import {Cluster} from '../../../shared/model/v1/cluster';
import {ClusterService} from '../../../shared/client/v1/cluster.service';
import {CacheService} from '../../../shared/auth/cache.service';
import {AceEditorService} from '../../../shared/ace-editor/ace-editor.service';
import {AceEditorMsg} from '../../../shared/ace-editor/ace-editor';
import {AuthService} from '../../../shared/auth/auth.service';

@Component({
  selector: 'create-edit-configmaptpl',
  templateUrl: 'create-edit-configmaptpl.component.html',
  styleUrls: ['create-edit-configmaptpl.scss']
})
export class CreateEditConfigMapTplComponent implements OnInit, AfterViewInit, OnDestroy {
  currentForm: FormGroup;
  configMapTpl: ConfigMapTpl = new ConfigMapTpl();
  checkOnGoing: boolean = false;
  isSubmitOnGoing: boolean = false;
  actionType: ActionType;
  app: App;
  configMap: ConfigMap;
  kubeConfigMap: KubeConfigMap = new KubeConfigMap();
  componentName = '配置集';
  clusters: Cluster[];

  top: number;
  box: HTMLElement;
  show: boolean = false;
  eventList: any = new Array();

  constructor(private configMapTplService: ConfigMapTplService,
              private configMapService: ConfigMapService,
              private fb: FormBuilder,
              private aceEditorService: AceEditorService,
              public cacheService: CacheService,
              private clusterService: ClusterService,
              private location: Location,
              private router: Router,
              public authService: AuthService,
              private appService: AppService,
              private route: ActivatedRoute,
              private messageHandlerService: MessageHandlerService,
              @Inject(DOCUMENT) private document: any,
              private eventManager: EventManager) {
  }

  ngAfterViewInit() {
    this.box = this.document.querySelector('.content-area');
    this.box.style.paddingBottom = '60px';
    this.eventList.push(
      this.eventManager.addEventListener(this.box, 'scroll', this.scrollEvent.bind(this, true)),
      this.eventManager.addGlobalEventListener('window', 'resize', this.scrollEvent.bind(this, false))
    );
    this.scrollEvent(false);
  }

  ngOnDestroy() {
    this.eventList.forEach(item => {
      item()
    });
    this.box.style.paddingBottom = '.75rem';
  }

  scrollEvent(scroll: boolean, event?) {
    let top = 0;
    if (event && scroll) {
      top = event.target.scrollTop;
      this.top = top + this.box.offsetHeight - 48;
    } else {
      // hack
      setTimeout(() => {
        this.top = this.box.scrollTop + this.box.offsetHeight - 48;
      }, 0)
    }
  }

  get datas(): FormArray {
    return this.currentForm.get('datas') as FormArray;
  };

  initData() {
    return this.fb.group({
      dataName: '',
      dataValue: '',
    });
  }

  onAddData(index: number) {
    const datas = this.currentForm.get(`datas`) as FormArray;
    datas.push(this.initData());
  }

  onDeleteData(index: number) {
    if (this.datas.controls.length <= 1) {
      return
    }
    this.datas.removeAt(index);
  }

  createForm() {
    let disabled = false;
    if (this.actionType == ActionType.EDIT) {
      disabled = true;
    }
    this.currentForm = this.fb.group({
      description: this.configMapTpl.description,
      datas: this.fb.array([
        this.fb.group({
          dataName: '',
          dataValue: '',
        })
      ]),
    });
  }

  initClusterGroups() {
    let clusters = Array<FormGroup>();
    this.clusters.forEach(cluster => {
      clusters.push(this.fb.group({
        checked: cluster.checked,
        name: cluster.name,
      }));
    });
    this.currentForm.setControl('clusters', this.fb.array(
      clusters
    ));

  }

  ngOnInit(): void {
    let appId = parseInt(this.route.parent.snapshot.params['id']);
    let namespaceId = this.cacheService.namespaceId;
    let configMapId = parseInt(this.route.snapshot.params['configMapId']);
    let tplId = parseInt(this.route.snapshot.params['tplId']);
    let observables = Array(
      this.clusterService.getNames(),
      this.appService.getById(appId, namespaceId),
      this.configMapService.getById(configMapId, appId)
    );
    if (tplId) {
      this.actionType = ActionType.EDIT;
      observables.push(this.configMapTplService.getById(tplId, appId));
    } else {
      this.actionType = ActionType.ADD_NEW;
    }
    this.createForm();
    Observable.combineLatest(observables).subscribe(
      response => {
        let clusters = response[0].data;
        for (let i = 0; i < clusters.length; i++) {
          clusters[i].checked = false;
        }
        this.clusters = this.filterCluster(clusters);
        this.app = response[1].data;
        this.configMap = response[2].data;
        let tpl = response[3];
        if (tpl) {
          this.configMapTpl = tpl.data;
          this.saveConfigMapTpl(JSON.parse(this.configMapTpl.template));
          if (this.configMapTpl.metaData) {
            let clusters = JSON.parse(this.configMapTpl.metaData).clusters;
            for (let cluster of clusters) {
              for (let i = 0; i < this.clusters.length; i++) {
                if (cluster == this.clusters[i].name) {
                  this.clusters[i].checked = true;
                }
              }
            }
          }
        }
        this.initClusterGroups();
      },
      error => {
        this.messageHandlerService.handleError(error);
      }
    );
  }

  filterCluster(clusters:Cluster[]): Cluster[] {
    return clusters.filter((clusterObj: Cluster) => {
      return this.cacheService.namespace.metaDataObj.clusterMeta &&
        this.cacheService.namespace.metaDataObj.clusterMeta[clusterObj.name]
    });
  }

  onCancel() {
    this.currentForm.reset();
    this.location.back();
  }

  onSubmit() {
    if (this.isSubmitOnGoing) {
      return;
    }
    this.isSubmitOnGoing = true;

    let metaDataStr = this.configMapTpl.metaData ? this.configMapTpl.metaData : '{}';
    let clusters = Array<string>();
    this.currentForm.controls.clusters.value.map((cluster: Cluster) => {
      if (cluster.checked) {
        clusters.push(cluster.name);
      }
    });
    let metaData = JSON.parse(metaDataStr);
    metaData['clusters'] = clusters;
    this.configMapTpl.metaData = JSON.stringify(metaData);
    let kubeConfigMap = this.getKubeConfigMapByForm();
    this.configMapTpl.template = JSON.stringify(kubeConfigMap);
    this.configMapTpl.id = undefined;
    this.configMapTplService.create(this.configMapTpl, this.app.id).subscribe(
      status => {
        this.isSubmitOnGoing = false;
        this.messageHandlerService.showSuccess('创建' + this.componentName + '模版成功！');
        this.router.navigate([`portal/namespace/${this.cacheService.namespaceId}/app/${this.app.id}/configmap/${this.configMap.id}`]);
      },
      error => {
        this.isSubmitOnGoing = false;
        this.messageHandlerService.handleError(error);
      }
    );
  }

  public get isValid(): boolean {
    return this.currentForm &&
      this.currentForm.valid &&
      !this.isSubmitOnGoing &&
      !this.checkOnGoing;
  }

  buildLabels(labels: {}) {
    if (!labels) {
      labels = {};
    }
    labels[this.authService.config[appLabelKey]] = this.app.name;
    labels[this.authService.config[namespaceLabelKey]] = this.cacheService.currentNamespace.name;
    labels['app'] = this.configMap.name;
    return labels;
  }

  getKubeConfigMapByForm() {
    const formValue = this.currentForm.value;
    this.configMapTpl.description = formValue.description;
    this.configMapTpl.name = this.configMap.name;
    this.configMapTpl.configMapId = this.configMap.id;

    let kubeConfigMap = this.kubeConfigMap;
    if (!kubeConfigMap.metadata) {
      kubeConfigMap.metadata = new ObjectMeta();
    }
    kubeConfigMap.metadata.name = this.configMap.name;
    kubeConfigMap.metadata.labels = this.buildLabels(kubeConfigMap.metadata.labels);
    if (formValue.datas && formValue.datas.length > 0) {
      kubeConfigMap.data = {};
      for (let data of formValue.datas) {
        kubeConfigMap.data[data.dataName] = data.dataValue;
      }
    }
    return kubeConfigMap;
  }

  openModal(): void {
    this.aceEditorService.announceMessage(AceEditorMsg.Instance(this.getKubeConfigMapByForm(),true));
  }

  saveConfigMapTpl(kubeConfigMap: KubeConfigMap) {
    if (kubeConfigMap && kubeConfigMap.data) {
      this.kubeConfigMap = kubeConfigMap;
      let datas = Array<FormGroup>();
      Object.getOwnPropertyNames(kubeConfigMap.data).map(key => {
        datas.push(this.fb.group({
          dataName: key,
          dataValue: kubeConfigMap.data[key],
        }),)
      });
      this.currentForm.setControl('datas', this.fb.array(datas));
    }
  }
}

